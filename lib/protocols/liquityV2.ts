import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import type { LiquityV2Branch } from "../types";

// Source: https://docs.liquity.org/v2-documentation/technical-docs-and-audits#contract-addresses
const COLLATERAL_REGISTRY  = "0xf949982b91c8c61e952b3ba942cbbfaef5386684" as const;
const MULTI_TROVE_GETTER   = "0xfa61db085510c64b83056db3a7acf3b6f631d235" as const;

// ActivePool addresses per branch (for aggWeightedDebtSum / aggRecordedDebt)
const ACTIVE_POOLS: Record<string, `0x${string}`> = {
  WETH:   "0xeb5a8c825582965f1d84606e078620a84ab16afe",
  wstETH: "0x531a8f99c70d6a56a7cee02d6b4281650d7919a0",
  rETH:   "0x9074d72cc82dad1e13e454755aa8f144c479532f",
};

const COLLATERAL_REGISTRY_ABI = parseAbi([
  "function totalCollaterals() external view returns (uint256)",
  "function getToken(uint256 index) external view returns (address)",
  "function getTroveManager(uint256 index) external view returns (address)",
]);

const ACTIVE_POOL_ABI = parseAbi([
  // Σ(debt_i × rate_i) — divide by total debt to get weighted avg rate
  "function aggWeightedDebtSum() external view returns (uint256)",
  // Total recorded debt in active pool (BOLD, 18 decimals)
  "function aggRecordedDebt() external view returns (uint256)",
]);

const MULTI_TROVE_GETTER_ABI = [
  {
    name: "getDebtPerInterestRateAscending",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_collIndex", type: "uint256" },
      { name: "_startId", type: "uint256" },
      { name: "_maxIterations", type: "uint256" },
    ],
    outputs: [
      {
        name: "data",
        type: "tuple[]",
        components: [
          { name: "interestBatchManager", type: "address" },
          { name: "interestRate", type: "uint256" },
          { name: "debt", type: "uint256" },
        ],
      },
      { name: "currId", type: "uint256" },
    ],
  },
] as const;

const ERC20_ABI = parseAbi(["function symbol() external view returns (string)"]);

const KNOWN_SYMBOLS: Record<string, string> = {
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
  "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": "wstETH",
  "0xae78736cd615f374d3085123a210448e74fc6393": "rETH",
};

const WAD = 10n ** 18n;

function wadToRate(w: bigint): number {
  // Rates are WAD (1e18 = 100%). Divide by 1000 first to stay in safe integer range.
  return Number(w / 1_000n) / 1e15;
}

const branchListCache: { data: LiquityV2Branch[]; ts: number } | null = null;
let _branchListCache: typeof branchListCache = null;

async function getClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });
}

async function fetch90dAvgRate(
  collateral: string
): Promise<number | undefined> {
  const activePool = ACTIVE_POOLS[collateral];
  if (!activePool) return undefined;
  try {
    const client = await getClient();
    // ~7200 blocks/day × 90 days = 648000 blocks ago
    const latestBlock = await client.getBlockNumber();
    const historicalBlock = latestBlock - 648_000n;

    const [aggWeighted, aggDebt] = await Promise.all([
      client.readContract({ address: activePool, abi: ACTIVE_POOL_ABI, functionName: "aggWeightedDebtSum", blockNumber: historicalBlock }),
      client.readContract({ address: activePool, abi: ACTIVE_POOL_ABI, functionName: "aggRecordedDebt", blockNumber: historicalBlock }),
    ]) as unknown as [bigint, bigint];

    if (aggDebt === 0n) return undefined;
    return Number(aggWeighted / aggDebt) / 1e15 / 1000;
  } catch {
    return undefined;
  }
}

async function fetchBranchRates(
  collateral: string,
  collIndex: number
): Promise<{ avg: number; p10: number }> {
  const FALLBACK = { avg: 0.055, p10: 0.03 };

  try {
    const client = await getClient();
    const activePool = ACTIVE_POOLS[collateral];
    if (!activePool) return FALLBACK;

    // 1. Weighted avg rate from activePool in one call
    const [aggWeightedDebtSum, aggRecordedDebt] = await Promise.all([
      client.readContract({ address: activePool, abi: ACTIVE_POOL_ABI, functionName: "aggWeightedDebtSum" }),
      client.readContract({ address: activePool, abi: ACTIVE_POOL_ABI, functionName: "aggRecordedDebt" }),
    ]) as unknown as [bigint, bigint];

    // aggWeightedDebtSum = Σ(debt × rate), both in WAD → ratio is rate in WAD
    // Divide by 1000 before Number() to stay within safe integer range
    const avgRateWad = aggRecordedDebt > 0n
      ? aggWeightedDebtSum / aggRecordedDebt
      : 0n;
    const avgRate = aggRecordedDebt > 0n
      ? Number(avgRateWad / 1_000n) / 1e15   // /1000 then /1e15 = /1e18
      : FALLBACK.avg;

    // 2. Min rate — walk up to 50 troves in ascending rate order
    const [debtPerRate] = await client.readContract({
      address: MULTI_TROVE_GETTER,
      abi: MULTI_TROVE_GETTER_ABI,
      functionName: "getDebtPerInterestRateAscending",
      args: [BigInt(collIndex), 0n, 50n],
    }) as [{ interestBatchManager: string; interestRate: bigint; debt: bigint }[], bigint];

    // Filter out zero-rate entries (batch managers / edge cases) and find p10
    const entries = debtPerRate.filter((e) => e.interestRate > 0n && e.debt > 0n);
    const minRate = entries.length > 0 ? wadToRate(entries[0].interestRate) : avgRate * 0.6;

    // p10: find rate where cumulative debt reaches 10% of total
    const totalDebt = entries.reduce((s, e) => s + e.debt, 0n);
    const target = totalDebt / 10n;
    let cumulative = 0n;
    let p10Rate = minRate;
    for (const e of entries) {
      cumulative += e.debt;
      if (cumulative >= target) {
        p10Rate = wadToRate(e.interestRate);
        break;
      }
    }

    return { avg: avgRate, p10: p10Rate };
  } catch (e) {
    console.error(`[liquityV2] rate fetch failed for ${collateral}:`, e);
    return FALLBACK;
  }
}

export async function getLiquityV2Branches(): Promise<LiquityV2Branch[]> {
  const now = Date.now();
  if (_branchListCache && now - _branchListCache.ts < 5 * 60_000) {
    return _branchListCache.data;
  }

  try {
    const client = await getClient();

    const totalCollaterals = Number(
      await client.readContract({
        address: COLLATERAL_REGISTRY,
        abi: COLLATERAL_REGISTRY_ABI,
        functionName: "totalCollaterals",
      })
    );

    const indices = Array.from({ length: totalCollaterals }, (_, i) => i);

    const [tokenAddresses, troveManagerAddresses] = await Promise.all([
      Promise.all(indices.map((i) =>
        client.readContract({ address: COLLATERAL_REGISTRY, abi: COLLATERAL_REGISTRY_ABI, functionName: "getToken", args: [BigInt(i)] })
      )),
      Promise.all(indices.map((i) =>
        client.readContract({ address: COLLATERAL_REGISTRY, abi: COLLATERAL_REGISTRY_ABI, functionName: "getTroveManager", args: [BigInt(i)] })
      )),
    ]);

    const symbols = await Promise.all(
      (tokenAddresses as `0x${string}`[]).map(async (addr) => {
        const known = KNOWN_SYMBOLS[addr.toLowerCase()];
        if (known) return known;
        try {
          return (await client.readContract({ address: addr, abi: ERC20_ABI, functionName: "symbol" })) as string;
        } catch {
          return addr.slice(0, 8);
        }
      })
    );

    const branches = await Promise.all(
      indices.map(async (i): Promise<LiquityV2Branch> => {
        const collateral = symbols[i];
        const rates = await fetchBranchRates(collateral, i);
        return {
          collateral,
          troveManagerAddress: (troveManagerAddresses[i] as string).toLowerCase(),
          avgRate: rates.avg,
          p25Rate: rates.p10,
          p10Rate: rates.p10,
        };
      })
    );

    _branchListCache = { data: branches, ts: now };
    return branches;
  } catch (e) {
    console.error("[liquityV2] branch discovery failed:", e);
    const fallback: LiquityV2Branch[] = [
      { collateral: "WETH",   troveManagerAddress: "0x7bcb64b2c9206a5b699ed43363f6f98d4776cf5a", avgRate: 0.055, p25Rate: 0.03, p10Rate: 0.03 },
      { collateral: "wstETH", troveManagerAddress: "0xa2895d6a3bf110561dfe4b71ca539d84e1928b22", avgRate: 0.05,  p25Rate: 0.025, p10Rate: 0.025 },
      { collateral: "rETH",   troveManagerAddress: "0xb2b2abeb5c357a234363ff5d180912d319e3e19e", avgRate: 0.05,  p25Rate: 0.025, p10Rate: 0.025 },
    ];
    _branchListCache = { data: fallback, ts: now };
    return fallback;
  }
}

export function mapToLiquityV2Branch(
  collateral: string,
  branches: LiquityV2Branch[]
): LiquityV2Branch | null {
  const upper = collateral.toUpperCase();
  return (
    branches.find((b) => b.collateral.toUpperCase() === upper) ??
    (upper === "ETH"   ? branches.find((b) => b.collateral === "WETH")   : undefined) ??
    (upper === "STETH" ? branches.find((b) => b.collateral === "wstETH") : undefined) ??
    null
  );
}
