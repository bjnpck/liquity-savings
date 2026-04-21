import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
            fontFamily: "monospace",
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
    size
  );
}
