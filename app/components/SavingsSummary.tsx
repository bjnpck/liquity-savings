"use client";

interface SavingsSummaryProps {
  totalDebtUsd: number;
  totalAnnualCostNow: number;
  totalAnnualCostSpot: number;
  totalAnnualSavingsAvg: number;
  totalAnnualSavingsCheap: number;
  positionCount: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function SavingsSummary({
  totalDebtUsd,
  totalAnnualCostNow,
  totalAnnualCostSpot,
  totalAnnualSavingsAvg,
  totalAnnualSavingsCheap,
  positionCount,
}: SavingsSummaryProps) {
  const hasSavings = totalAnnualSavingsAvg > 0;

  return (
    <div className="mb-6 overflow-hidden rounded-lg" style={{ background: "#222", border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* Label row */}
      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="text-xs" style={{ color: "#888884" }}>
          {positionCount} borrow position{positionCount !== 1 ? "s" : ""}
          {totalDebtUsd > 0 && (
            <> · <span className="font-mono" style={{ color: "#e8e8e6" }}>{fmt(totalDebtUsd)}</span> total debt</>
          )}
          {!hasSavings && <span className="ml-3" style={{ color: "#777773" }}>No savings found</span>}
        </span>
      </div>

      {/* 3-col grid */}
      <div className="grid grid-cols-3" style={{ borderBottom: "none" }}>
        {/* Current cost (90d avg basis) */}
        <div className="px-4 py-3" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[11px] uppercase tracking-widest font-medium mb-1" style={{ color: "#777773" }}>Current cost</p>
          <p className="font-mono text-lg font-semibold" style={{ color: "#e05c4a" }}>
            {fmt(totalAnnualCostNow)}<span className="text-xs font-normal ml-1" style={{ color: "#777773" }}>/yr</span>
          </p>
          {totalAnnualCostSpot !== totalAnnualCostNow && (
            <p className="text-[11px] font-mono mt-0.5" style={{ color: "#555552" }}>
              now: {fmt(totalAnnualCostSpot)}/yr
            </p>
          )}
        </div>

        {/* At avg rate */}
        <div className="px-4 py-3" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[11px] uppercase tracking-widest font-medium mb-1" style={{ color: "#777773" }}>Liquity Avg (90d)</p>
          {hasSavings && totalAnnualSavingsAvg > 0 ? (
            <>
              <p className="font-mono text-lg font-semibold" style={{ color: "#5a9e62" }}>
                {fmt(totalAnnualCostNow - totalAnnualSavingsAvg)}<span className="text-xs font-normal ml-1" style={{ color: "#777773" }}>/yr</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#5a9e62" }}>save {fmt(totalAnnualSavingsAvg)}</p>
            </>
          ) : (
            <p className="font-mono text-lg" style={{ color: "#333" }}>—</p>
          )}
        </div>

        {/* At lowest rate */}
        <div className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-widest font-medium mb-1" style={{ color: "#777773" }}>Liquity Low (90d)</p>
          {hasSavings && totalAnnualSavingsCheap > 0 ? (
            <>
              <p className="font-mono text-lg font-semibold" style={{ color: "#5a9e62" }}>
                {fmt(totalAnnualCostNow - totalAnnualSavingsCheap)}<span className="text-xs font-normal ml-1" style={{ color: "#777773" }}>/yr</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#5a9e62" }}>save {fmt(totalAnnualSavingsCheap)}</p>
            </>
          ) : (
            <p className="font-mono text-lg" style={{ color: "#333" }}>—</p>
          )}
        </div>
      </div>
    </div>
  );
}
