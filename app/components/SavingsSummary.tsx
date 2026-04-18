"use client";

import React from "react";

interface SavingsSummaryProps {
  totalDebtUsd: number;
  totalAnnualCostNow: number;     // 90d avg based
  totalAnnualCostSpot: number;    // spot based
  totalAnnualSavingsNow: number;  // spot rate vs Liquity weighted avg
  totalAnnualSavingsAvg: number;  // 90d vs 90d savings
  positionCount: number;
  protocolNames: string;
}

function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);
  const rect = visible && ref.current ? ref.current.getBoundingClientRect() : null;

  return (
    <span
      className="inline-block ml-1 align-middle"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span
        ref={ref}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] leading-none cursor-help"
        style={{ border: "0.5px solid #444", color: "#666663" }}
      >i</span>
      {rect && (
        <span
          className="pointer-events-none z-50 leading-snug shadow-2xl"
          style={{
            background: "#1a1a1a",
            color: "#d0d0ce",
            border: "0.5px solid rgba(255,255,255,0.14)",
            borderRadius: "6px",
            padding: "6px 10px",
            maxWidth: "220px",
            width: "max-content",
            fontSize: "12px",
            textTransform: "none",
            letterSpacing: "normal",
            fontWeight: "normal",
            position: "fixed",
            left: `${rect.left - 6}px`,
            top: `${rect.top + rect.height / 2}px`,
            transform: "translateX(-100%) translateY(-50%)",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
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
  totalAnnualSavingsNow,
  totalAnnualSavingsAvg,
  positionCount,
  protocolNames,
}: SavingsSummaryProps) {
  const hasSavings = totalAnnualSavingsAvg > 0;
  const hasSavingsNow = totalAnnualSavingsNow > 0;
  const totalAnnualCostLiquityNow = totalAnnualCostSpot - totalAnnualSavingsNow;
  const totalAnnualCostLiquity90d = totalAnnualCostNow - totalAnnualSavingsAvg;

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

      {/* 4-col grid */}
      <div className="grid grid-cols-4">
        {/* Your current cost — spot */}
        <div className="px-4 py-3" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[11px] uppercase tracking-widest font-medium mb-1" style={{ color: "#777773" }}>
            Your Yearly Cost<Tooltip text="Based on today's rate" />
          </p>
          <p className="font-mono text-lg font-semibold" style={{ color: "#aaa9a4" }}>
            {fmt(totalAnnualCostSpot)}<span className="text-xs font-normal ml-1" style={{ color: "#777773" }}>/y</span>
          </p>
        </div>

        {/* Liquity current cost + savings now */}
        <div className="px-4 py-3" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[11px] uppercase tracking-widest font-medium mb-1" style={{ color: "#777773" }}>Liquity Yearly Cost</p>
          {hasSavingsNow ? (
            <>
              <p className="font-mono text-lg font-semibold" style={{ color: "#5a9e62" }}>
                {fmt(totalAnnualCostLiquityNow)}<span className="text-xs font-normal ml-1" style={{ color: "#777773" }}>/y</span>
              </p>
              <p className="font-mono text-xs mt-1" style={{ color: "#4a8a52" }}>
                save {fmt(totalAnnualSavingsNow)}/y
              </p>
            </>
          ) : (
            <p className="font-mono text-lg" style={{ color: "#333" }}>—</p>
          )}
        </div>

        {/* Your 90d avg cost */}
        <div className="px-4 py-3" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[11px] uppercase tracking-widest font-medium mb-1" style={{ color: "#777773" }}>
            Your Yearly Cost (90d avg)<Tooltip text={`Based on ${protocolNames} 90 day avg rate`} />
          </p>
          <p className="font-mono text-lg font-semibold" style={{ color: "#aaa9a4" }}>
            {fmt(totalAnnualCostNow)}<span className="text-xs font-normal ml-1" style={{ color: "#777773" }}>/y</span>
          </p>
        </div>

        {/* Liquity 90d avg cost + savings */}
        <div className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-widest font-medium mb-1" style={{ color: "#777773" }}>Liquity Yearly Cost (90d avg)</p>
          {hasSavings ? (
            <>
              <p className="font-mono text-lg font-semibold" style={{ color: "#5a9e62" }}>
                {fmt(totalAnnualCostLiquity90d)}<span className="text-xs font-normal ml-1" style={{ color: "#777773" }}>/y</span>
              </p>
              <p className="font-mono text-xs mt-1" style={{ color: "#4a8a52" }}>
                save {fmt(totalAnnualSavingsAvg)}/y
              </p>
            </>
          ) : (
            <p className="font-mono text-lg" style={{ color: "#333" }}>—</p>
          )}
        </div>
      </div>
    </div>
  );
}
