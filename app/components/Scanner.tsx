"use client";

import { useEffect, useState } from "react";
import type { BorrowPosition, ProtocolStatus as TProtocolStatus, Protocol } from "@/lib/types";
import { ProtocolStatusList } from "./ProtocolStatus";
import { SavingsSummary } from "./SavingsSummary";
import { PositionsTable } from "./PositionsTable";

interface ScannerProps {
  address: string;
}

type ScanResult = {
  statuses: TProtocolStatus[];
  enrichedPositions: BorrowPosition[];
  totalAnnualCostNow: number;
  totalAnnualCostSpot: number;
  totalAnnualCostLiquity: number;
  totalAnnualSavingsAvg: number;
  totalAnnualSavingsCheap: number;
};

const ALL_PROTOCOLS: Protocol[] = [
  "Aave v3",
  "Spark",
  "Maker MCD",
  "Compound v3",
];

export function Scanner({ address }: ScannerProps) {
  const [statuses, setStatuses] = useState<TProtocolStatus[]>(
    ALL_PROTOCOLS.map((p) => ({ protocol: p, loading: true, error: null, positions: [] }))
  );
  const [result, setResult] = useState<ScanResult | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) return;

    const controller = new AbortController();

    setResult(null);
    setGlobalError(null);
    setIsLoading(true);
    setStatuses(
      ALL_PROTOCOLS.map((p) => ({ protocol: p, loading: true, error: null, positions: [] }))
    );

    fetch(`/api/positions?address=${address}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<ScanResult>;
      })
      .then((data) => {
        setResult(data);
        setStatuses(data.statuses);
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        setGlobalError(e.message ?? "Scan failed");
        setStatuses(
          ALL_PROTOCOLS.map((p) => ({ protocol: p, loading: false, error: null, positions: [] }))
        );
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [address]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#f0f0ee" }}>Borrow Position Scanner</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: "#777773" }}>
            {address.slice(0, 6)}…{address.slice(-4)}
          </p>
        </div>
        {isLoading && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "#777773" }}>
            <span className="w-3 h-3 rounded-full border animate-spin" style={{ borderColor: "#444", borderTopColor: "#aaa9a4" }} />
            Scanning…
          </div>
        )}
      </div>

      <ProtocolStatusList statuses={statuses} />

      {globalError && (
        <div className="rounded-lg p-4 mb-6 text-sm" style={{ background: "rgba(224,92,74,0.08)", border: "1px solid rgba(224,92,74,0.25)", color: "#e05c4a" }}>
          {globalError}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {result.enrichedPositions.length > 0 ? (
            <>
              <SavingsSummary
                totalDebtUsd={result.enrichedPositions.filter((p) => !p.isAlternativeCollateral).reduce((sum, p) => sum + p.debtUsd, 0)}
                totalAnnualCostNow={result.totalAnnualCostNow}
                totalAnnualCostSpot={result.totalAnnualCostSpot}
                totalAnnualSavingsAvg={result.totalAnnualSavingsAvg}
                totalAnnualSavingsCheap={result.totalAnnualSavingsCheap}
                positionCount={result.enrichedPositions.length}
              />
              <PositionsTable positions={result.enrichedPositions} />

              {/* Why + CTA */}
              <div className="mt-8 pt-8 flex flex-col md:flex-row gap-8 items-start" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {/* Left: Why */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#aaa9a4" }}>Why use Liquity V2 to borrow?</p>
                  <ul className="space-y-1.5 text-sm" style={{ color: "#aaa9a4" }}>
                    {[
                      { text: "The lowest and most stable rates in DeFi" },
                      { text: "Immutable contracts with no TradFi dependencies" },
                      { text: "BOLD is a decentralized and highly secure stablecoin", links: [
                        { label: "Bluechip ↗", href: "https://bluechip.org/en/coins/bold" },
                        { label: "Pharos ↗", href: "https://pharos.watch/stablecoin/bold-liquity/" },
                      ]},
                      { text: "BOLD is redeemable 24/7, onchain and permissionless" },
                      { text: "Competitive, sustainable, fully onchain yield", links: [
                        { label: "Dune ↗", href: "https://dune.com/liquity/bold-yields" },
                      ]},
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 flex-wrap">
                        <span className="mt-0.5 text-xs flex-shrink-0" style={{ color: "#d4883a" }}>→</span>
                        <span>{item.text}</span>
                        {item.links && item.links.map((link) => (
                          <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"
                            className="text-xs px-1.5 py-0.5 rounded transition-colors whitespace-nowrap"
                            style={{ background: "rgba(212,136,58,0.10)", color: "#d4883a", border: "1px solid rgba(212,136,58,0.25)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(212,136,58,0.5)")}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(212,136,58,0.25)")}
                          >
                            {link.label}
                          </a>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Right: CTAs */}
                <div className="flex flex-col gap-3 flex-shrink-0 w-full md:w-48">
                  {(() => {
                    const slugMap: Record<string, string> = { WETH: "eth", wstETH: "wsteth", rETH: "reth" };
                    const cols = Array.from(new Set(result.enrichedPositions.map((p) => p.liquityV2Collateral).filter(Boolean)));
                    const href = cols.length === 1
                      ? `https://liquity.app/borrow/${slugMap[cols[0]!] ?? cols[0]!.toLowerCase()}`
                      : "https://liquity.app/borrow";
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-6 py-2.5 font-semibold rounded-lg active:scale-95 transition-all text-sm whitespace-nowrap"
                        style={{ background: "#c9901e", color: "#111" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#d4983a")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#c9901e")}
                      >
                        Use Liquity V2 ↗
                      </a>
                    );
                  })()}
                  <div className="pt-3 flex flex-col gap-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-xs text-center leading-relaxed" style={{ color: "#aaa9a4" }}>DeFi Saver user?<br />Migrate with 1 click</p>
                    <a
                      href="https://app.defisaver.com/shifter"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-6 py-2.5 text-sm rounded-lg active:scale-95 transition-all whitespace-nowrap font-medium"
                      style={{ background: "rgba(90,158,98,0.15)", color: "#5a9e62", border: "1px solid rgba(90,158,98,0.4)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(90,158,98,0.22)"; e.currentTarget.style.borderColor = "rgba(90,158,98,0.6)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(90,158,98,0.15)"; e.currentTarget.style.borderColor = "rgba(90,158,98,0.4)"; }}
                    >
                      Use DeFi Saver ↗
                    </a>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <p className="text-sm font-medium mb-1" style={{ color: "#aaa9a4" }}>No borrow positions found</p>
              <p className="text-xs" style={{ color: "#777773" }}>No open stablecoin borrows detected on Aave, Spark, Maker, or Compound for this address.</p>
            </div>
          )}
        </>
      )}

      {!result && !globalError && isLoading && (
        <div className="space-y-2 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "#222", border: "1px solid rgba(255,255,255,0.05)" }} />
          ))}
        </div>
      )}
    </div>
  );
}
