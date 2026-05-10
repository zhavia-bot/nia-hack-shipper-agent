"use client";

import { useQuery } from "convex/react";
import { motion } from "motion/react";
import { api } from "@autodrop/convex/api";
import { Activity, CheckCircle, Clock, X } from "@/components/icons";
import { fmtRelativeTime } from "@/lib/format";

interface AgentLogStreamProps {
  /** Tail only this experiment's events; omit for the user-wide stream. */
  experimentId?: string;
  /** Cap visible rows (default 50). */
  limit?: number;
  /** Hide the "tailing" header — useful for the dedicated /live page. */
  bare?: boolean;
  /** Constrain stream height; pass `null` to remove the cap. */
  maxHeightClass?: string | null;
}

const LEVEL: Record<
  string,
  { icon: typeof Clock; cls: string }
> = {
  info: { icon: Activity, cls: "text-sky-400" },
  ok: { icon: CheckCircle, cls: "text-emerald-400" },
  warn: { icon: Clock, cls: "text-amber-400" },
  error: { icon: X, cls: "text-rose-400" },
};

const FALLBACK_LEVEL = LEVEL["info"]!;

/**
 * P8.13 — live narrative tail. Convex `useQuery` is the subscription;
 * each new `agentEvents` row appended by the agent surfaces here on
 * the next tick, no polling.
 */
export function AgentLogStream({
  experimentId,
  limit = 50,
  bare = false,
  maxHeightClass = "max-h-[420px]",
}: AgentLogStreamProps) {
  const userEvents = useQuery(
    api.agentEvents.recentForCurrentUser,
    experimentId ? "skip" : { limit },
  );
  const expEvents = useQuery(
    api.agentEvents.recentForExperiment,
    experimentId ? { experimentId, limit } : "skip",
  );
  const events = experimentId ? expEvents : userEvents;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-sm">
      {!bare && (
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            {experimentId ? "Experiment stream" : "Agent stream"}
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            tailing
          </span>
        </div>
      )}
      <div className="p-4">
        {events === undefined && (
          <p className="text-xs text-zinc-500">Connecting…</p>
        )}
        {events && events.length === 0 && (
          <p className="text-xs text-zinc-500">
            {experimentId
              ? "No events for this experiment yet."
              : "No agent activity yet. Start a generation to see the stream fill in."}
          </p>
        )}
        {events && events.length > 0 && (
          <ul
            className={
              "space-y-1 overflow-y-auto pr-1 " +
              (maxHeightClass ?? "")
            }
          >
            {events.map((e, i) => {
              const meta = LEVEL[e.level] ?? FALLBACK_LEVEL;
              const Icon = meta.icon;
              return (
                <motion.li
                  key={e._id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.16, delay: Math.min(i, 12) * 0.012 }}
                  className="grid grid-cols-[1rem_minmax(0,9rem)_1fr_auto] items-baseline gap-3 rounded-md px-2 py-1 font-mono text-[12.5px] leading-snug hover:bg-white/[0.02]"
                >
                  <Icon className={"mt-0.5 h-3.5 w-3.5 " + meta.cls} />
                  <span className="truncate text-[10.5px] uppercase tracking-wide text-zinc-500">
                    {e.kind}
                  </span>
                  <span className="text-zinc-200">{e.summary}</span>
                  <span className="text-[10.5px] text-zinc-500">
                    {fmtRelativeTime(e.timestamp)}
                  </span>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
