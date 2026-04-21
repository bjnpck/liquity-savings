"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
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
        if (data.enrichedPositions.length === 0) {
          posthog.capture("no_positions_found", { address });
        } else {
          posthog.capture("scan_completed", {
            address,
            position_count: data.enrichedPositions.length,
            total_annual_savings_avg: data.totalAnnualSavingsAvg,
            total_annual_cost_spot: data.totalAnnualCostSpot,
            protocols: [...new Set(data.enrichedPositions.map((p) => p.protocol))],
          });
        }
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        posthog.capture("scan_failed", { address, error: e.message ?? "Scan failed" });
        posthog.captureException(e);
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
          <h2 className="text-sm font-semibold" style={{ color: "#f0f0ee" }}>Position Scanner</h2>
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
                totalAnnualSavingsNow={result.enrichedPositions.filter((p) => !p.isAlternativeCollateral).reduce((sum, p) => sum + Math.max(0, p.liquityV2RateAvg !== undefined ? p.debtUsd * (p.currentRateApr - p.liquityV2RateAvg) : 0), 0)}
                totalAnnualSavingsAvg={result.totalAnnualSavingsAvg}
                positionCount={result.enrichedPositions.length}
                protocolNames={[...new Set(result.enrichedPositions.filter((p) => !p.isAlternativeCollateral).map((p) => p.protocol))].join(", ")}
              />
              {result.totalAnnualSavingsAvg > 0 && (
                <div className="mb-4 flex items-center justify-between px-5 py-3.5" style={{ background: "rgba(90,158,98,0.08)", border: "0.5px solid rgba(90,158,98,0.25)", borderRadius: "8px" }}>
                  <p style={{ fontSize: "15px", color: "#aaa9a4" }}>
                    You can save{" "}
                    <span style={{ fontWeight: 700, color: "#5a9e62" }}>
                      ${Math.round(result.totalAnnualSavingsAvg).toLocaleString("en-US")}
                    </span>
                    /y by moving to Liquity.
                  </p>
                  <a
                    href="https://liquity.app/borrow"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap active:scale-95 ml-6"
                    style={{ background: "#c9901e", color: "#fff", fontWeight: 500 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#d4983a")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#c9901e")}
                    onClick={() => posthog.capture("liquity_cta_clicked", {
                      address,
                      annual_savings: result.totalAnnualSavingsAvg,
                    })}
                  >
                    Use Liquity V2 ↗
                  </a>
                </div>
              )}
              <PositionsTable positions={result.enrichedPositions} />

              {/* Why Liquity V2 */}
              <div className="mt-8 pt-6 rounded-lg px-5 py-5" style={{ background: "#1c1c1c", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-sm font-semibold mb-4" style={{ color: "#d0d0ce" }}>Why use Liquity V2 to borrow?</p>
                <ul className="space-y-2">
                  {[
                    { text: "The lowest and most stable rates in DeFi" },
                    { text: "Immutable contracts with no TradFi dependencies" },
                    { text: "BOLD is a decentralized and highly secure stablecoin", links: [
                      { label: "Bluechip ↗", href: "https://bluechip.org/en/coins/bold" },
                      { label: "Pharos ↗", href: "https://pharos.watch/stablecoin/bold-liquity/" },
                    ]},
                    { text: "BOLD is redeemable 24/7 fully onchain and permissionless." },
                    { text: "Competitive, sustainable, fully onchain yield", links: [
                      { label: "Dune ↗", href: "https://dune.com/liquity/bold-yields" },
                    ]},
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 flex-wrap">
                      <span className="mt-0.5 text-xs flex-shrink-0" style={{ color: "#d4883a" }}>→</span>
                      <span className="text-sm" style={{ color: "#b0b0ae" }}>{item.text}</span>
                      {item.links && item.links.map((link) => (
                        <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"
                          className="text-xs px-2 py-0.5 rounded transition-colors whitespace-nowrap"
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
