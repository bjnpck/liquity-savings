import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { getTokenPrices } from "../prices";
import type { BorrowPosition } from "../types";

// On-chain only — no subgraph dependency

// GetCdps helper — returns all CDPs for an address in one call
const GET_CDPS_ADDRESS    = "0x36a724bd100c39f0ea4d3a20f7097ee01a8ff573" as const;
const CDP_MANAGER_ADDRESS = "0x5ef30b9986345249bc32d8928b7ee64de9435e39" as const;
const VAT_ADDRESS         = "0x35d1b3f3d7966a1dfe207aa4514c12a259a0492b" as const;
const JUG_ADDRESS         = "0x19c0976f590d67707e62397c87829d896dc0f1f1" as const;
// DSProxy registry — CDPs are owned by proxy, not EOA directly
const PROXY_REGISTRY      = "0x4678f0a6958e4d2bc4f1baf7bc52e8f3564f3fe4" as const;

const GET_CDPS_ABI = parseAbi([
  "function getCdpsAsc(address manager, address guy) external view returns (uint256[] ids, address[] urns, bytes32[] ilks)",
]);

const PROXY_REGISTRY_ABI = parseAbi([
  "function proxies(address) external view returns (address)",
]);

const VAT_ABI = parseAbi([
  "function urns(bytes32 ilk, address urn) external view returns (uint256 ink, uint256 art)",
  "function ilks(bytes32 ilk) external view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)",
]);

const JUG_ABI = parseAbi([
  "function ilks(bytes32) external view returns (uint256 duty, uint256 rho)",
]);

const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

function dutyToApr(duty: bigint): number {
  const ratePerSecond = Number(duty - RAY) / 1e27;
  return ratePerSecond * SECONDS_PER_YEAR;
}

function bytes32ToIlkName(b: `0x${string}`): string {
  // Strip trailing null bytes and decode as ASCII
  const hex = b.slice(2);
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (code === 0) break;
    str += String.fromCharCode(code);
  }
  return str;
}

function ilkToCollateral(ilk: string): string {
  const token = ilk.split("-")[0].toUpperCase();
  if (token === "ETH") return "WETH";
  if (token === "WSTETH") return "wstETH";
  if (token === "RETH") return "rETH";
  return token;
}

export async function fetchMakerPositions(address: string): Promise<BorrowPosition[]> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });

  // 1. Resolve DSProxy — CDPs are owned by the proxy, not the EOA directly
  const proxy = await client.readContract({
    address: PROXY_REGISTRY,
    abi: PROXY_REGISTRY_ABI,
    functionName: "proxies",
    args: [address as `0x${string}`],
  }) as `0x${string}`;

  // Try both the proxy (if it exists) and the EOA itself
  const ZERO = "0x0000000000000000000000000000000000000000";
  const lookupAddresses = [
    ...(proxy && proxy !== ZERO ? [proxy] : []),
    address as `0x${string}`,
  ];

  // 2. Get all CDP ids + urns + ilks — try proxy first, then EOA
  let ids: bigint[] = [];
  let urns: `0x${string}`[] = [];
  let ilkBytes: `0x${string}`[] = [];

  for (const lookupAddr of lookupAddresses) {
    const result = (await client.readContract({
      address: GET_CDPS_ADDRESS,
      abi: GET_CDPS_ABI,
      functionName: "getCdpsAsc",
      args: [CDP_MANAGER_ADDRESS, lookupAddr],
    })) as unknown as [bigint[], `0x${string}`[], `0x${string}`[]];

    if (result[0].length > 0) {
      [ids, urns, ilkBytes] = result;
      break;
    }
  }

  if (ids.length === 0) return [];

  // 2. Batch: read urn balances (ink, art) and ilk rates from Vat
  const uniqueIlks = Array.from(new Set(ilkBytes.map((b) => b as `0x${string}`)));

  const [vatIlkResults, jugResults, vatUrnResults] = await Promise.all([
    // ilk data: Art, rate, spot, line, dust
    Promise.all(
      uniqueIlks.map((ilk) =>
        client.readContract({ address: VAT_ADDRESS, abi: VAT_ABI, functionName: "ilks", args: [ilk] })
      )
    ),
    // stability fee duty per ilk
    Promise.all(
      uniqueIlks.map((ilk) =>
        client.readContract({ address: JUG_ADDRESS, abi: JUG_ABI, functionName: "ilks", args: [ilk] })
      )
    ),
    // urn balances per CDP
    Promise.all(
      urns.map((urn, i) =>
        client.readContract({ address: VAT_ADDRESS, abi: VAT_ABI, functionName: "urns", args: [ilkBytes[i], urn] })
      )
    ),
  ]);

  // Build lookup maps
  const ilkRateMap = new Map<string, bigint>();
  const ilkDutyMap = new Map<string, number>();
  uniqueIlks.forEach((ilk, i) => {
    const [, rate] = vatIlkResults[i] as unknown as [bigint, bigint, bigint, bigint, bigint];
    const [duty] = jugResults[i] as unknown as [bigint, bigint];
    ilkRateMap.set(ilk, rate);
    ilkDutyMap.set(ilk, dutyToApr(duty));
  });

  // 3. Filter active CDPs (art > 0) and build positions
  const activePositions = ids
    .map((id, i) => {
      const [ink, art] = vatUrnResults[i] as unknown as [bigint, bigint];
      if (art === 0n) return null;
      const ilkKey = ilkBytes[i];
      const ilkName = bytes32ToIlkName(ilkKey);
      const rate = ilkRateMap.get(ilkKey) ?? RAY;
      const debt = (art * rate) / RAY; // in 18-decimal DAI
      return { id, ink, art, debt, ilkName, ilkKey };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (activePositions.length === 0) return [];

  const collaterals = Array.from(new Set(activePositions.map((p) => ilkToCollateral(p.ilkName))));
  const prices = await getTokenPrices([...collaterals, "DAI"]);

  return activePositions.map((p): BorrowPosition => {
    const collateral = ilkToCollateral(p.ilkName);
    const debtAmount = Number(p.debt) / 1e18;
    const debtUsd = debtAmount * (prices["DAI"] ?? 1);
    const inkAmount = Number(p.ink) / 1e18;
    const collateralUsd = inkAmount * (prices[collateral] ?? 0);
    const currentRateApr = ilkDutyMap.get(p.ilkKey) ?? 0.05;

    return {
      protocol: "Maker MCD",
      collateral,
      collateralUsd,
      debtToken: "DAI",
      debtTokenAddress: "0x6b175474e89094c44da98b954eedeac495271d0f",
      debtAmount,
      debtUsd,
      currentRateApr,
    };
  });
}
