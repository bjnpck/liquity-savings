import Link from "next/link";
import { readLeaderboardData } from "@/lib/leaderboard";
import { LeaderboardTable } from "./LeaderboardTable";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Top Borrowers — Liquity Savings",
  description: "See how much top DeFi borrowers could save by migrating to Liquity v2.",
};

export default function LeaderboardPage() {
  const data = readLeaderboardData();

  const scrapedAt = data?.scrapedAt
    ? new Date(data.scrapedAt).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        timeZone: "UTC", timeZoneName: "short",
      })
    : null;

  return (
    <main className="min-h-screen" style={{ background: "#1a1a1a" }}>
      {/* Nav */}
      <nav className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "#f0f0ee" }}
          >
            ← Borrow rate comparooor
          </Link>
          <a
            href="https://app.defisaver.com/shifter"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg transition-all font-medium active:scale-95 hover:opacity-90"
            style={{ background: "#5a9e62", color: "#fff" }}
          >
            Migrate with DeFi Saver ↗
          </a>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-2" style={{ color: "#f0f0ee" }}>
            Top borrowers
          </h1>
          <p className="text-sm" style={{ color: "#aaa9a4" }}>
            How much top DeFi borrowers could save by migrating to Liquity v2.
          </p>
        </div>

        {/* Table */}
        <LeaderboardTable entries={data?.entries ?? []} />

        {/* Footer */}
        <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          {scrapedAt && (
            <p className="text-xs" style={{ color: "#555" }}>
              Last updated: {scrapedAt} · Updates daily
            </p>
          )}
          {!data && (
            <p className="text-xs" style={{ color: "#555" }}>
              No data yet. Run{" "}
              <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: "#2a2a2a" }}>
                npx tsx scripts/scrape-leaderboard.ts
              </code>{" "}
              to populate.
            </p>
          )}
          <p className="text-xs" style={{ color: "#555" }}>
            Savings vs Liquity average rate · Sources:{" "}
            <a
              href="https://defiexplore.com/spark/positions/core"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              DeFi Explore
            </a>
            {" "}· on-chain protocol data
          </p>
        </div>
      </div>
    </main>
  );
}
