import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Fetch DM Mono 500 from Google Fonts
  const cssRes = await fetch(
    "https://fonts.googleapis.com/css2?family=DM+Mono:wght@500&display=swap",
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  const css = await cssRes.text();
  const fontUrl = css.match(/src: url\(([^)]+)\)/)?.[1];
  const fontData = fontUrl
    ? await fetch(fontUrl).then((r) => r.arrayBuffer())
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#141414",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontWeight: 500,
            fontSize: 96,
            color: "#f0f0ee",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <span>Rate</span>
          <span>
            Compar<span style={{ color: "#c9901e" }}>ooo</span>r
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      ...(fontData
        ? { fonts: [{ name: "DM Mono", data: fontData, weight: 500 }] }
        : {}),
    }
  );
}
