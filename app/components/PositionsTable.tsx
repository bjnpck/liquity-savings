"use client";

import React from "react";
import type { BorrowPosition } from "@/lib/types";
import { ProtocolBadge } from "./ProtocolBadge";

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function SavingsCell({ savings, best }: { savings: number | undefined; best?: boolean }) {
  if (savings === undefined || savings <= 0) return <span style={{ color: "#333" }}>—</span>;
  return (
    <span className="font-mono font-medium" style={{ color: best ? "#7ab882" : "#5a9e62" }}>
      {fmt(savings)}/y
    </span>
  );
}

function ColTooltip({ text }: { text: string }) {
  const [visible, setVisible] = React.useState(false);
  const iconRef = React.useRef<HTMLSpanElement>(null);
  const rect = visible && iconRef.current ? iconRef.current.getBoundingClientRect() : null;

  return (
    <span
      className="inline-block ml-1 align-middle"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span
        ref={iconRef}
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
            maxWidth: "200px",
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

const borderRow = { borderBottom: "1px solid rgba(255,255,255,0.05)" };
const dividerCell = { borderLeft: "1px solid rgba(255,255,255,0.08)" };
const bestCell = { borderLeft: "2px solid #7ab882" };

type Header = { label: React.ReactNode; align: "left" | "right"; tooltip?: string; divider?: boolean };

function buildHeaders(protocolNames: string): Header[] {
  return [
    { label: "Protocol",    align: "left" },
    { label: "Collateral",  align: "left" },
    { label: "Debt Token",  align: "left" },
    { label: "Debt (USD)",  align: "right" },
    { label: <><span>Your</span><br /><span>Current Rate</span></>,    align: "right", divider: true, tooltip: "The rate you are currently paying." },
    { label: "Liquity Rate",                                            align: "right",                tooltip: "The current range of rates on Liquity V2." },
    { label: "Savings",                                                 align: "right" },
    { label: <><span>Your 90d</span><br /><span>Avg Rate</span></>,    align: "right", divider: true, tooltip: `The avg rate on ${protocolNames} over the last 90 days.` },
    { label: <><span>Liquity 90d</span><br /><span>Avg Rate</span></>, align: "right",                tooltip: "The avg rate on Liquity V2 over the last 90 days." },
    { label: "Savings",                                                 align: "right" },
  ];
}

export function PositionsTable({ positions }: { positions: BorrowPosition[] }) {
  if (positions.length === 0) return null;

  // Derive protocol names for dynamic tooltip
  const protocolNames = [...new Set(positions.map((p) => p.protocol))].join(", ");
  const HEADERS = buildHeaders(protocolNames);

  // Best-row detection per savings column
  const maxSavingsNow = positions.reduce((max, pos) => {
    const v = pos.liquityV2RateAvg !== undefined ? pos.debtUsd * (pos.currentRateApr - pos.liquityV2RateAvg) : 0;
    return v > max ? v : max;
  }, 0);
  const maxSavings90d = positions.reduce((max, pos) => {
    const v = pos.annualSavingsAvg ?? 0;
    return v > max ? v : max;
  }, 0);

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* Desktop */}
      <table className="w-full text-sm hidden md:table">
        <thead>
          <tr style={{ background: "#2a2a2a", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
            {HEADERS.map((h, i) => (
              <th
                key={i}
                className={`px-3 py-2.5 text-[11px] uppercase tracking-widest font-medium leading-tight`}
                style={{ color: "#777773", textAlign: h.align, ...(h.divider ? dividerCell : {}) }}
              >
                {h.label}
                {h.tooltip && <ColTooltip text={h.tooltip} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, i) => {
            const savingsNow = pos.liquityV2RateAvg !== undefined
              ? pos.debtUsd * (pos.currentRateApr - pos.liquityV2RateAvg)
              : undefined;
            const isBestNow = savingsNow !== undefined && savingsNow > 0 && savingsNow === maxSavingsNow;
            const isBest90d = (pos.annualSavingsAvg ?? 0) > 0 && (pos.annualSavingsAvg ?? 0) === maxSavings90d;

            return (
              <tr
                key={i}
                className="transition-colors"
                style={borderRow}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#252525")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td className="px-3 py-2.5"><ProtocolBadge protocol={pos.protocol} /></td>
                <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#aaa9a4" }}>
                  {pos.collateral}
                  {pos.protocol === "Aave v3" && (
                    <span className="ml-1 text-[10px] cursor-help" style={{ color: "#444" }} title="Aave cross-collateral — ETH branch shown">*</span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#aaa9a4" }}>{pos.debtToken}</td>
                <td className="px-3 py-2.5 text-right font-mono font-medium" style={{ color: "#f0f0ee" }}>
                  {pos.isAlternativeCollateral
                    ? <span className="text-xs" style={{ color: "#333" }}>↑ same</span>
                    : fmt(pos.debtUsd)
                  }
                </td>
                {/* Your current rate — live spot */}
                <td className="px-3 py-2.5 text-right" style={dividerCell}>
                  <span className="font-mono font-medium" style={{ color: "#aaa9a4" }}>{fmtPct(pos.currentRateApr)}</span>
                </td>
                {/* Liquity rate — range p10–avg */}
                <td className="px-3 py-2.5 text-right">
                  {pos.liquityV2RateP10 !== undefined && pos.liquityV2RateAvg !== undefined
                    ? <span className="font-mono font-medium" style={{ color: "#aaa9a4" }}>
                        {fmtPct(pos.liquityV2RateP10)}–{fmtPct(pos.liquityV2RateAvg)}
                      </span>
                    : <span style={{ color: "#333" }}>—</span>
                  }
                </td>
                {/* Savings (now) */}
                <td className="px-3 py-2.5 text-right" style={isBestNow ? bestCell : {}}>
                  <SavingsCell savings={savingsNow} best={isBestNow} />
                </td>
                {/* Your 90d avg rate */}
                <td className="px-3 py-2.5 text-right" style={dividerCell}>
                  {pos.currentRate90dAvg !== undefined
                    ? <span className="font-mono" style={{ color: "#aaa9a4" }}>{fmtPct(pos.currentRate90dAvg)}</span>
                    : <span style={{ color: "#333" }}>—</span>
                  }
                </td>
                {/* Liquity 90d avg rate */}
                <td className="px-3 py-2.5 text-right">
                  {pos.liquityV2Rate90dAvg !== undefined
                    ? <span className="font-mono" style={{ color: "#aaa9a4" }}>{fmtPct(pos.liquityV2Rate90dAvg)}</span>
                    : <span style={{ color: "#333" }}>—</span>
                  }
                </td>
                {/* Savings 90d */}
                <td className="px-3 py-2.5 text-right" style={isBest90d ? bestCell : {}}>
                  <SavingsCell savings={pos.annualSavingsAvg} best={isBest90d} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile */}
      <div className="md:hidden divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        {positions.map((pos, i) => {
          const savingsNow = pos.liquityV2RateAvg !== undefined
            ? pos.debtUsd * (pos.currentRateApr - pos.liquityV2RateAvg)
            : undefined;
          const isBestNow = savingsNow !== undefined && savingsNow > 0 && savingsNow === maxSavingsNow;
          const isBest90d = (pos.annualSavingsAvg ?? 0) > 0 && (pos.annualSavingsAvg ?? 0) === maxSavings90d;

          return (
            <div key={i} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <ProtocolBadge protocol={pos.protocol} />
                <span className="font-mono text-xs" style={{ color: "#aaa9a4" }}>
                  {pos.collateral} · {pos.debtToken}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Debt</p>
                  <p className="font-mono font-medium" style={{ color: "#f0f0ee" }}>{fmt(pos.debtUsd)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Your Current Rate</p>
                  <p className="font-mono font-medium" style={{ color: "#aaa9a4" }}>{fmtPct(pos.currentRateApr)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Your 90d Avg</p>
                  {pos.currentRate90dAvg !== undefined
                    ? <p className="font-mono" style={{ color: "#aaa9a4" }}>{fmtPct(pos.currentRate90dAvg)}</p>
                    : <span style={{ color: "#333" }}>—</span>
                  }
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Liquity Rate</p>
                  {pos.liquityV2RateP10 !== undefined && pos.liquityV2RateAvg !== undefined
                    ? <p className="font-mono font-medium" style={{ color: "#aaa9a4" }}>
                        {fmtPct(pos.liquityV2RateP10)}–{fmtPct(pos.liquityV2RateAvg)}
                      </p>
                    : <span style={{ color: "#333" }}>—</span>
                  }
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Liquity 90d Avg</p>
                  {pos.liquityV2Rate90dAvg !== undefined
                    ? <p className="font-mono" style={{ color: "#aaa9a4" }}>{fmtPct(pos.liquityV2Rate90dAvg)}</p>
                    : <span style={{ color: "#333" }}>—</span>
                  }
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Savings</p>
                  <SavingsCell savings={pos.annualSavingsAvg} best={isBest90d} />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Savings (now)</p>
                  <SavingsCell savings={savingsNow} best={isBestNow} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
