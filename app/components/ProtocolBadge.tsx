import type { Protocol } from "@/lib/types";

const STYLES: Record<Protocol, { bg: string; text: string; border: string }> = {
  "Aave v3":     { bg: "rgba(139,92,246,0.12)", text: "#a78bfa", border: "rgba(139,92,246,0.30)" },
  "Spark":       { bg: "rgba(56,165,201,0.12)",  text: "#38a5c9", border: "rgba(56,165,201,0.30)" },
  "Maker MCD":   { bg: "rgba(45,175,162,0.10)",  text: "#2db5a3", border: "rgba(45,175,162,0.25)" },
  "Compound v3": { bg: "rgba(90,158,98,0.12)",   text: "#5a9e62", border: "rgba(90,158,98,0.28)" },
};

export function ProtocolBadge({ protocol }: { protocol: Protocol }) {
  const s = STYLES[protocol];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {protocol}
    </span>
  );
}
