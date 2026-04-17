export type Protocol =
  | "Aave v3"
  | "Spark"
  | "Maker MCD"
  | "Compound v3";

export type CollateralToken = "ETH" | "WETH" | "wstETH" | "rETH" | "stETH" | "WBTC" | "cbETH" | "Other";

export interface BorrowPosition {
  protocol: Protocol;
  collateral: string;          // symbol, e.g. "wstETH"
  collateralUsd: number;
  debtToken: string;           // symbol, e.g. "USDC"
  debtTokenAddress?: string;   // underlying token address for Sphere API lookup
  debtAmount: number;          // raw units
  debtUsd: number;
  currentRateApr: number;      // e.g. 0.055 = 5.5%
  currentRate90dAvg?: number;  // 90-day average borrow rate from Sphere API
  // Populated after Liquity v2 rate fetch
  liquityV2Collateral?: string; // mapped Liquity v2 branch
  liquityV2RateAvg?: number;
  liquityV2RateP25?: number;
  liquityV2RateP10?: number;
  liquityV2Rate90dAvg?: number;
  annualCostNow?: number;
  annualSavingsAvg?: number;
  annualSavingsCheap?: number;  // vs p10
  isAlternativeCollateral?: boolean; // true for 2nd/3rd collateral rows — same debt, different branch option
}

export interface ProtocolStatus {
  protocol: Protocol;
  loading: boolean;
  error: string | null;
  positions: BorrowPosition[];
}

export interface LiquityV2Branch {
  collateral: string;         // "WETH" | "wstETH" | "rETH"
  troveManagerAddress: string;
  avgRate: number;
  p25Rate: number;
  p10Rate: number;
  avg90dRate?: number;        // 90-day average borrow rate (on-chain historical block)
}
