import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Fetch DM Sans Bold for headline weight — 3s timeout, fall back gracefully
  let fontData: ArrayBuffer | null = null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const cssRes = await fetch(
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&display=swap",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: controller.signal }
    );
    clearTimeout(t);
    const css = await cssRes.text();
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (url) fontData = await fetch(url).then((r) => r.arrayBuffer());
  } catch { /* fall back to system font */ }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#141414",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "52px 64px",
          fontFamily: fontData ? "'DM Sans'" : "sans-serif",
          boxSizing: "border-box",
        }}
      >
        {/* Top row — badge */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <span
            style={{
              fontSize: 13,
              padding: "6px 16px",
              borderRadius: 99,
              border: "1px solid rgba(90,158,98,0.5)",
              color: "#5a9e62",
              background: "rgba(90,158,98,0.06)",
              letterSpacing: "0.04em",
              fontFamily: "monospace",
            }}
          >
            DeFi borrow scanner
          </span>
        </div>

        {/* Middle — headline + sub */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "12px 0" }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "#f0f0ee",
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
              marginBottom: 22,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Stop overpaying</span>
            {/* Space must be inside a span — satori drops whitespace text nodes */}
            <div style={{ display: "flex", flexDirection: "row" }}>
              <span>for your</span>
              <span style={{ color: "#c9901e" }}>{" loan."}</span>
            </div>
          </div>
          <div style={{ fontSize: 22, color: "#aaa9a4", fontWeight: 400, lineHeight: 1.5, display: "flex" }}>
            Paste your wallet — check your savings.
          </div>
        </div>

        {/* Bottom row — rate pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: "8px 18px",
              borderRadius: 6,
              color: "#c0392b",
              border: "1px solid rgba(192,57,43,0.35)",
              background: "rgba(192,57,43,0.08)",
              fontFamily: "monospace",
            }}
          >
            <span style={{ fontSize: 17, fontWeight: 500 }}>4.28%</span>
            <span style={{ fontSize: 11, opacity: 0.6, letterSpacing: "0.04em" }}>current rate</span>
          </div>
          <span style={{ color: "#444", fontSize: 22, display: "flex" }}>→</span>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: "8px 18px",
              borderRadius: 6,
              color: "#5a9e62",
              border: "1px solid rgba(90,158,98,0.35)",
              background: "rgba(90,158,98,0.08)",
              fontFamily: "monospace",
            }}
          >
            <span style={{ fontSize: 17, fontWeight: 500 }}>3.21%</span>
            <span style={{ fontSize: 11, opacity: 0.6, letterSpacing: "0.04em" }}>new rate</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      ...(fontData ? { fonts: [{ name: "DM Sans", data: fontData, weight: 700 }] } : {}),
    }
  );
}
