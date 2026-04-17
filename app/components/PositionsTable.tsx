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

function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <span className="relative inline-block ml-1" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      <span
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] leading-none cursor-help"
        style={{ border: "1px solid #333", color: "#777773" }}
      >i</span>
      {visible && (
        <span
          className="pointer-events-none absolute z-50 w-56 rounded-lg px-3 py-2 text-xs leading-snug shadow-2xl"
          style={{ background: "#2a2a2a", color: "#f0f0ee", border: "1px solid rgba(255,255,255,0.10)" }}
          ref={(el) => {
            if (el) {
              const parent = el.previousElementSibling as HTMLElement;
              const rect = parent?.getBoundingClientRect();
              if (rect) {
                el.style.position = "fixed";
                el.style.left = `${rect.left + rect.width / 2 - 112}px`;
                el.style.top = `${rect.top - 8}px`;
                el.style.transform = "translateY(-100%)";
              }
            }
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function SavingsCell({ savings }: { savings: number | undefined }) {
  if (savings === undefined || savings <= 0) return <span style={{ color: "#333" }}>—</span>;
  return <span className="font-mono font-medium" style={{ color: "#5a9e62" }}>{fmt(savings)}/yr</span>;
}

function RateCell({ rate }: { rate: number | undefined }) {
  if (rate === undefined) return <span style={{ color: "#333" }}>—</span>;
  return <span className="font-mono font-medium" style={{ color: "#5a9e62" }}>{fmtPct(rate)}</span>;
}

const borderRow = { borderBottom: "1px solid rgba(255,255,255,0.05)" };
const borderCol = { borderRight: "1px solid rgba(255,255,255,0.06)" };

export function PositionsTable({ positions }: { positions: BorrowPosition[] }) {
  if (positions.length === 0) return null;

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* Desktop */}
      <table className="w-full text-sm hidden md:table">
        <thead>
          {/* Group row */}
          <tr style={{ background: "#2a2a2a", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <th colSpan={5} style={{ ...borderCol }} />
            <th
              colSpan={2}
              className="text-center px-3 py-2 text-[11px] uppercase tracking-widest font-medium"
              style={{ color: "#aaa9a4", ...borderCol, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              Liquity avg
              <Tooltip text="Liquity enables you to set your own rate. This is the current average rate." />
            </th>
            <th
              colSpan={2}
              className="text-center px-3 py-2 text-[11px] uppercase tracking-widest font-medium"
              style={{ color: "#aaa9a4", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              Liquity lowest
              <Tooltip text="Liquity enables you to set your own rate. This is the current lowest rate." />
            </th>
          </tr>
          {/* Sub-header */}
          <tr style={{ background: "#2a2a2a", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
            {[
              { label: "Protocol", align: "left" },
              { label: "Collateral", align: "left" },
              { label: "Debt Token", align: "left" },
              { label: "Debt (USD)", align: "right" },
              { label: "Current Rate", align: "right" },
              { label: "Rate", align: "right" },
              { label: "Savings", align: "right" },
              { label: "Rate", align: "right" },
              { label: "Savings", align: "right" },
            ].map((h, i) => (
              <th
                key={i}
                className={`px-3 py-2 text-[11px] uppercase tracking-widest font-medium text-${h.align}`}
                style={{ color: "#777773" }}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, i) => {
            const savingsVsLowest = pos.liquityV2RateP10 !== undefined
              ? pos.debtUsd * (pos.currentRateApr - pos.liquityV2RateP10)
              : undefined;
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
                <td className="px-3 py-2.5 text-right">
                  <span className="font-mono font-semibold" style={{ color: "#e05c4a" }}>{fmtPct(pos.currentRateApr)}</span>
                  {pos.currentRate90dAvg !== undefined && (
                    <div className="text-[10px] font-mono mt-0.5" style={{ color: "#555552" }}>
                      90d {fmtPct(pos.currentRate90dAvg)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right"><RateCell rate={pos.liquityV2RateAvg} /></td>
                <td className="px-3 py-2.5 text-right"><SavingsCell savings={pos.annualSavingsAvg} /></td>
                <td className="px-3 py-2.5 text-right"><RateCell rate={pos.liquityV2RateP10} /></td>
                <td className="px-3 py-2.5 text-right"><SavingsCell savings={savingsVsLowest} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile */}
      <div className="md:hidden divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        {positions.map((pos, i) => {
          const savingsVsLowest = pos.liquityV2RateP10 !== undefined
            ? pos.debtUsd * (pos.currentRateApr - pos.liquityV2RateP10)
            : undefined;
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
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Current Rate</p>
                  <p className="font-mono font-semibold" style={{ color: "#e05c4a" }}>{fmtPct(pos.currentRateApr)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>v2 Avg rate</p>
                  <RateCell rate={pos.liquityV2RateAvg} />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Save vs avg</p>
                  <SavingsCell savings={pos.annualSavingsAvg} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
