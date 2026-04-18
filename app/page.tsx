"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { Scanner } from "./components/Scanner";

export default function Home() {
  const [input, setInput] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!isAddress(trimmed)) {
      setError("Enter a valid Ethereum address (0x…)");
      return;
    }
    setError("");
    setAddress(trimmed);
  }

  return (
    <main className="min-h-screen" style={{ background: "#1a1a1a" }}>
      {/* Nav */}
      <nav className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setAddress(null)}
            className="flex items-center transition-opacity hover:opacity-70"
          >
            <span className="text-sm font-medium" style={{ color: "#f0f0ee" }}>Liquity Savings</span>
          </button>

          {address && (
            <div className="flex items-end" style={{ gap: "12px" }}>
              {/* Liquity V2 */}
              <a
                href="https://liquity.app/borrow"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap active:scale-95"
                style={{ background: "#c9901e", color: "#fff", fontWeight: 500 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#d4983a")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#c9901e")}
              >
                Use Liquity V2 ↗
              </a>

              {/* DeFi Saver — label above button, far right */}
              <div className="flex flex-col items-end" style={{ gap: "6px" }}>
                <p className="text-[11px] leading-none whitespace-nowrap" style={{ color: "#aaa9a4" }}>
                  DeFi Saver user? Migrate with 1 click
                </p>
                <a
                  href="https://app.defisaver.com/shifter"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap font-medium active:scale-95"
                  style={{ background: "#5a9e62", color: "#fff" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#6aae72")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#5a9e62")}
                >
                  Use DeFi Saver ↗
                </a>
              </div>
            </div>
          )}
        </div>
      </nav>

      {address ? (
        <Scanner address={address} />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-4">

          <h1 className="text-3xl sm:text-4xl font-semibold mb-3 leading-tight" style={{ color: "#f0f0ee" }}>
            Stop overpaying for your loan
          </h1>
          <p className="text-sm max-w-md mb-8" style={{ color: "#aaa9a4" }}>
            Paste your address and see how much you could save by migrating borrow positions to Liquity v2.
          </p>

          <form onSubmit={handleSubmit} className="w-full max-w-lg">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(""); }}
                placeholder="0x…"
                spellCheck={false}
                className="flex-1 px-4 py-2.5 rounded-lg font-mono text-sm outline-none transition-colors"
                style={{
                  background: "#222",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#f0f0ee",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(201,144,30,0.5)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
              />
              <button
                type="submit"
                className="px-6 py-2.5 rounded-lg font-semibold text-sm active:scale-95 transition-all whitespace-nowrap"
                style={{ background: "#c9901e", color: "#111" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#d4983a")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#c9901e")}
              >
                Check savings →
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-left" style={{ color: "#e05c4a" }}>{error}</p>}
          </form>

          <p className="mt-6 text-xs" style={{ color: "#777773" }}>
            Scans Aave v3 · Spark · Maker MCD · Compound v3
          </p>
        </div>
      )}

    </main>
  );
}
