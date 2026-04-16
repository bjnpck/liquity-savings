import type { BorrowPosition, ProtocolStatus, Protocol } from "./types";

const STABLECOINS = new Set([
  "USDC", "USDT", "DAI", "GHO", "USDS", "LUSD", "BOLD", "FRAX", "PYUSD", "CRVUSD",
]);

function isStablecoin(symbol: string): boolean {
  return STABLECOINS.has(symbol.toUpperCase());
}
import { getLiquityV2Branches, mapToLiquityV2Branch } from "./protocols/liquityV2";
import { fetchAavePositions } from "./protocols/aave";
import { fetchMakerPositions } from "./protocols/maker";
import { fetchCompoundPositions } from "./protocols/compound";
import { fetchSparkPositions } from "./protocols/spark";

export type ScanResult = {
  statuses: ProtocolStatus[];
  enrichedPositions: BorrowPosition[];
  totalAnnualCostNow: number;
  totalAnnualCostLiquity: number;
  totalAnnualSavingsAvg: number;
  totalAnnualSavingsCheap: number;
};

const PROTOCOLS: {
  name: Protocol;
  fn: (addr: string) => Promise<BorrowPosition[]>;
}[] = [
  { name: "Aave v3", fn: fetchAavePositions },
  { name: "Maker MCD", fn: fetchMakerPositions },
  { name: "Compound v3", fn: fetchCompoundPositions },
  { name: "Spark", fn: fetchSparkPositions },
];

const PROTOCOL_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

export async function scanAllProtocols(
  address: string,
  onUpdate: (status: ProtocolStatus) => void
): Promise<ScanResult> {
  // Fetch Liquity v2 rates in parallel with protocol scans
  const [branches, ...protocolResults] = await Promise.all([
    withTimeout(getLiquityV2Branches(), PROTOCOL_TIMEOUT_MS, "Liquity v2"),
    ...PROTOCOLS.map(async ({ name, fn }) => {
      try {
        const positions = await withTimeout(fn(address), PROTOCOL_TIMEOUT_MS, name);
        const status: ProtocolStatus = {
          protocol: name,
          loading: false,
          error: null,
          positions,
        };
        onUpdate(status);
        return status;
      } catch (e) {
        console.error(`[scanner] ${name} failed:`, e);
        const status: ProtocolStatus = {
          protocol: name,
          loading: false,
          error: e instanceof Error ? e.message : "Unknown error",
          positions: [],
        };
        onUpdate(status);
        return status;
      }
    }),
  ]);

  // Enrich positions with Liquity v2 rates and savings calc
  const enrichedPositions: BorrowPosition[] = [];

  for (const status of protocolResults as ProtocolStatus[]) {
    for (const pos of status.positions.filter((p) => isStablecoin(p.debtToken))) {
      const branch = mapToLiquityV2Branch(pos.collateral, branches) ?? undefined;

      const enriched: BorrowPosition = { ...pos };

      if (branch) {
        enriched.liquityV2Collateral = branch.collateral;
        enriched.liquityV2RateAvg = branch.avgRate;
        enriched.liquityV2RateP25 = branch.p25Rate;
        enriched.liquityV2RateP10 = branch.p10Rate;
        enriched.annualCostNow = pos.debtUsd * pos.currentRateApr;
        enriched.annualSavingsAvg = pos.debtUsd * (pos.currentRateApr - branch.avgRate);
        enriched.annualSavingsCheap = pos.debtUsd * (pos.currentRateApr - branch.p10Rate);
      } else {
        // No equivalent Liquity v2 branch — only show current cost
        enriched.annualCostNow = pos.debtUsd * pos.currentRateApr;
        enriched.annualSavingsAvg = 0;
        enriched.annualSavingsCheap = 0;
      }

      enrichedPositions.push(enriched);
    }
  }

  // Exclude alternative-collateral rows from totals (same debt, different branch option)
  const primaryPositions = enrichedPositions.filter((p) => !p.isAlternativeCollateral);

  const totalAnnualCostNow = primaryPositions.reduce(
    (sum, p) => sum + (p.annualCostNow ?? 0),
    0
  );

  // For savings, group by (protocol + debtToken) and take the BEST (max) savings
  // across all collateral options — the user will pick the best branch to migrate to
  const groupKey = (p: BorrowPosition) => `${p.protocol}:${p.debtToken}`;

  const bestSavingsAvgByGroup = new Map<string, number>();
  const bestSavingsCheapByGroup = new Map<string, number>();
  for (const p of enrichedPositions) {
    const key = groupKey(p);
    const avg = Math.max(0, p.annualSavingsAvg ?? 0);
    const cheap = Math.max(0, p.annualSavingsCheap ?? 0);
    bestSavingsAvgByGroup.set(key, Math.max(bestSavingsAvgByGroup.get(key) ?? 0, avg));
    bestSavingsCheapByGroup.set(key, Math.max(bestSavingsCheapByGroup.get(key) ?? 0, cheap));
  }

  const totalAnnualSavingsAvg = [...bestSavingsAvgByGroup.values()].reduce((a, b) => a + b, 0);
  const totalAnnualSavingsCheap = [...bestSavingsCheapByGroup.values()].reduce((a, b) => a + b, 0);

  const totalAnnualCostLiquity = totalAnnualCostNow - totalAnnualSavingsAvg;

  return {
    statuses: protocolResults as ProtocolStatus[],
    enrichedPositions,
    totalAnnualCostNow,
    totalAnnualCostLiquity,
    totalAnnualSavingsAvg,
    totalAnnualSavingsCheap,
  };
}
