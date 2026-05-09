"use client";

import { useQuery } from "convex/react";
import { api } from "@autoresearch/convex/api";
import { fmtRelativeTime } from "@/lib/format";

const LEVEL_COLOR: Record<string, string> = {
  info: "#1f6feb",
  ok: "#0a7d3b",
  warn: "#a06800",
  error: "#c53030",
};

const LEVEL_DOT: Record<string, string> = {
  info: "•",
  ok: "✓",
  warn: "!",
  error: "✗",
};

/**
 * P8.13 — live tail of the agent's narrative events for the current
 * Clerk-authenticated user. Convex's `useQuery` keeps this updated
 * without polling — every new `agentEvents` row appended by the
 * agent surfaces here within a tick.
 *
 * We cap the rendered list at 50 to keep the DOM tight; older rows
 * are still in Convex if anyone asks.
 */
export function AgentLogStream() {
  const events = useQuery(api.agentEvents.recentForCurrentUser, { limit: 50 });

  return (
    <section
      style={{
        background: "#0e0e0e",
        color: "#e8e6e1",
        border: "1px solid #1c1c1c",
        borderRadius: 12,
        padding: "1.25rem 1.5rem",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.85rem",
        }}
      >
        <div
          style={{
            fontSize: "0.78rem",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "#9c9890",
          }}
        >
          Agent stream — live
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.72rem",
            color: "#9c9890",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#26d07c",
              boxShadow: "0 0 6px #26d07c",
              display: "inline-block",
            }}
          />
          tailing
        </span>
      </div>

      {events === undefined && (
        <p style={{ color: "#9c9890", fontSize: "0.85rem" }}>Connecting…</p>
      )}
      {events && events.length === 0 && (
        <p style={{ color: "#9c9890", fontSize: "0.85rem" }}>
          No agent activity yet. Trigger a generation to see the stream
          fill in.
        </p>
      )}
      {events && events.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: "0.4rem",
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {events.map((e) => (
            <li
              key={e._id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto auto 1fr auto",
                gap: "0.6rem",
                alignItems: "baseline",
                fontSize: "0.82rem",
                lineHeight: 1.45,
              }}
            >
              <span
                style={{
                  color: LEVEL_COLOR[e.level] ?? "#999",
                  fontWeight: 700,
                  width: "1ch",
                }}
              >
                {LEVEL_DOT[e.level] ?? "·"}
              </span>
              <span style={{ color: "#7a766f", fontSize: "0.72rem" }}>
                {e.kind}
              </span>
              <span style={{ color: "#e8e6e1" }}>{e.summary}</span>
              <span style={{ color: "#7a766f", fontSize: "0.72rem" }}>
                {fmtRelativeTime(e.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
