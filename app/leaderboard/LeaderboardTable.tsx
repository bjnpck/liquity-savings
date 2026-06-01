"use client";

import { useState } from "react";
import type { LeaderboardEntry } from "@/lib/leaderboard";

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function AddressCell({ entry }: { entry: LeaderboardEntry }) {
  if (entry.protocol === "Maker MCD" && entry.cdpId != null) {
    return (
      <a
        href={`https://defiexplore.com/maker/cdp/${entry.cdpId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs transition-colors"
        style={{ color: "#aaa9a4" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#c9901e")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#aaa9a4")}
      >
        CDP #{entry.cdpId}
      </a>
    );
  }
  return (
    <a
      href={`https://etherscan.io/address/${entry.address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs transition-colors"
      style={{ color: "#aaa9a4" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#c9901e")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "#aaa9a4")}
    >
      {shortAddr(entry.address)}
    </a>
  );
}

const borderRow = { borderBottom: "1px solid rgba(255,255,255,0.05)" };
const dividerCell = { borderLeft: "1px solid rgba(255,255,255,0.08)" };

type Protocol = LeaderboardEntry["protocol"];

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  const protocols = Array.from(new Set(entries.map((e) => e.protocol))) as Protocol[];
  const [active, setActive] = useState<Protocol>(protocols[0] ?? "Spark");

  const filtered = entries.filter((e) => e.protocol === active);
  const totalDebt = filtered.reduce((sum, entry) => sum + entry.debtUsd, 0);
  const totalSavings = filtered.reduce((sum, entry) => sum + entry.annualSavings, 0);

  if (entries.length === 0) {
    return (
      <p className="text-center py-12 text-sm" style={{ color: "#555" }}>
        No data yet — run the scraper first.
      </p>
    );
  }

  return (
    <div>
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Positions tracked", value: filtered.length.toString() },
          { label: "Total debt", value: fmt(totalDebt) },
          { label: "Total potential savings", value: `${fmt(totalSavings)}/y` },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg px-4 py-3"
            style={{ background: "#222", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: "#777773" }}>
              {stat.label}
            </p>
            <p className="text-xl font-semibold font-mono" style={{ color: "#f0f0ee" }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Protocol tabs */}
      {protocols.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {protocols.map((p) => (
            <button
              key={p}
              onClick={() => setActive(p)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={
                active === p
                  ? { background: "#5a9e62", color: "#fff" }
                  : { background: "#2a2a2a", color: "#777773", border: "1px solid rgba(255,255,255,0.08)" }
              }
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        {/* Desktop */}
        <table className="w-full text-sm hidden md:table">
          <thead>
            <tr style={{ background: "#2a2a2a", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
              {[
                { label: "#",               align: "left" },
                { label: "Address",         align: "left" },
                { label: "Collateral",      align: "left" },
                { label: "Debt Token",      align: "left" },
                { label: "Debt (USD)",      align: "right" },
                { label: "Current Rate",    align: "right", divider: true },
                { label: "Liquity Avg Rate", align: "right" },
                { label: "Annual Savings",  align: "right" },
              ].map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2.5 text-[11px] uppercase tracking-widest font-medium"
                  style={{
                    color: "#777773",
                    textAlign: h.align as "left" | "right",
                    ...((h as { divider?: boolean }).divider ? dividerCell : {}),
                  }}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, i) => (
              <tr
                key={entry.address + entry.debtToken}
                className="transition-colors"
                style={borderRow}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#252525")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td className="px-3 py-2.5 text-xs" style={{ color: "#555" }}>{i + 1}</td>
                <td className="px-3 py-2.5"><AddressCell entry={entry} /></td>
                <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#aaa9a4" }}>
                  {entry.collateral}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#aaa9a4" }}>
                  {entry.debtToken}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-medium" style={{ color: "#f0f0ee" }}>
                  {fmt(entry.debtUsd)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono" style={{ color: "#aaa9a4", ...dividerCell }}>
                  {fmtPct(entry.currentRateApr)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono" style={{ color: "#aaa9a4" }}>
                  {fmtPct(entry.liquityRateAvg)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: "#7ab882" }}>
                  {entry.annualSavings > 0 ? fmt(entry.annualSavings) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile */}
        <div className="md:hidden divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          {filtered.map((entry, i) => (
            <div key={entry.address + entry.debtToken} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "#555" }}>#{i + 1}</span>
                <AddressCell entry={entry} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Debt</p>
                  <p className="font-mono font-medium" style={{ color: "#f0f0ee" }}>{fmt(entry.debtUsd)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Collateral / Token</p>
                  <p className="font-mono text-xs" style={{ color: "#aaa9a4" }}>{entry.collateral} · {entry.debtToken}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Current Rate</p>
                  <p className="font-mono" style={{ color: "#aaa9a4" }}>{fmtPct(entry.currentRateApr)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Liquity Avg Rate</p>
                  <p className="font-mono" style={{ color: "#aaa9a4" }}>{fmtPct(entry.liquityRateAvg)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: "#777773" }}>Annual Savings</p>
                  <p className="font-mono font-semibold" style={{ color: "#7ab882" }}>
                    {entry.annualSavings > 0 ? fmt(entry.annualSavings) : "—"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
