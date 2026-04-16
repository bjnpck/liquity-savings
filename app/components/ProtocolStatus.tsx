"use client";

import type { ProtocolStatus as TProtocolStatus } from "@/lib/types";
import { ProtocolBadge } from "./ProtocolBadge";

export function ProtocolStatusList({ statuses }: { statuses: TProtocolStatus[] }) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {statuses.map((s) => (
        <div
          key={s.protocol}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
          style={{ background: "#222", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <ProtocolBadge protocol={s.protocol} />
          {s.loading ? (
            <span className="flex items-center gap-1.5" style={{ color: "#777773" }}>
              <span className="w-2.5 h-2.5 rounded-full border border-current border-t-transparent animate-spin" />
              Scanning
            </span>
          ) : s.error ? (
            <span className="flex items-center gap-1.5" style={{ color: "#e05c4a" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Error
            </span>
          ) : (
            <span className="flex items-center gap-1.5" style={{ color: "#aaa9a4" }}>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: s.positions.length > 0 ? "#5a9e62" : "#333" }}
              />
              {s.positions.length === 0
                ? "No positions"
                : `${s.positions.length} position${s.positions.length > 1 ? "s" : ""}`}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
