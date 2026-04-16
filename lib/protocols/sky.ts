import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import type { BorrowPosition } from "../types";

// Sky/USDS DSR (Dai Savings Rate) – show current savings/borrow rates
const POT_ADDRESS = "0x197E90f9FAD81970bA7976f33CbD77088E5D7cf7" as const;
const SKY_POT_ADDRESS = "0x0048fc4357db3c0f45adea433a07a20769ddb0cf" as const; // USDS Pot

const POT_ABI = parseAbi([
  "function dsr() external view returns (uint256)",
  "function chi() external view returns (uint256)",
  "function pie(address) external view returns (uint256)",
]);

const USDS_SAVINGS_ADDRESS = "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD" as const;
const SUSDS_ABI = parseAbi([
  "function balanceOf(address) external view returns (uint256)",
  "function convertToAssets(uint256 shares) external view returns (uint256)",
  "function ssr() external view returns (uint256)", // Sky Savings Rate
]);

const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

function dsrToApr(dsr: bigint): number {
  // dsr is a per-second multiplier in RAY; APR = (dsr - RAY) * SECONDS_PER_YEAR / RAY
  const ratePerSecond = Number(dsr - RAY) / 1e27;
  return ratePerSecond * SECONDS_PER_YEAR;
}

export async function fetchSkyPositions(address: string): Promise<BorrowPosition[]> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });

  try {
    const [pie, chi, dsr] = await Promise.all([
      client.readContract({
        address: POT_ADDRESS,
        abi: POT_ABI,
        functionName: "pie",
        args: [address as `0x${string}`],
      }),
      client.readContract({
        address: POT_ADDRESS,
        abi: POT_ABI,
        functionName: "chi",
      }),
      client.readContract({
        address: POT_ADDRESS,
        abi: POT_ABI,
        functionName: "dsr",
      }),
    ]);

    const pieVal = pie as bigint;
    const chiVal = chi as bigint;
    const dsrVal = dsr as bigint;

    // DAI balance = pie * chi / RAY
    const daiBalance = (pieVal * chiVal) / RAY;
    if (daiBalance === 0n) return [];

    const daiAmount = Number(daiBalance) / 1e18;
    const dsrApr = dsrToApr(dsrVal);

    // The DSR is a yield on DAI savings, not a borrow.
    // We treat it as "you have DAI locked in DSR at rate X — if you moved to Liquity v2
    // you'd get BOLD yield instead", but that's not a borrow position.
    // Sky/USDS borrowing happens via Maker (included above).
    // So: only surface if daiAmount > 0 and DSR is worse than BOLD yield would be.
    // We expose it as a "savings" position (zero cost borrow = just showing DSR rate).
    return [
      {
        protocol: "Sky/USDS",
        collateral: "DAI",
        collateralUsd: daiAmount,
        debtToken: "DAI",
        debtAmount: daiAmount,
        debtUsd: daiAmount,
        currentRateApr: dsrApr, // earning rate, will be treated differently in UI
      },
    ];
  } catch {
    return [];
  }
}
