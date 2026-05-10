"use client";

import { useQuery } from "convex/react";
import { motion } from "motion/react";
import { api } from "@autodrop/convex/api";
import { publicEnv } from "@/lib/env";
import { fmtUsd } from "@/lib/format";

/**
 * The single most important number on the screen. Convex realtime sub —
 * updates the moment a webhook writes a new charge.
 */
export function DollarTicker() {
  const { DASHBOARD_TOKEN } = publicEnv();
  const data = useQuery(api.dashboard.netDollars, { token: DASHBOARD_TOKEN });

  const net = data?.net ?? null;
  const positive = (net ?? 0) >= 0;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-7 text-zinc-100 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        Net dollars · Stripe balance, ledger view
      </div>
      <motion.div
        key={net ?? "loading"}
        initial={{ opacity: 0.5, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className={
          "mt-1 text-5xl font-bold tracking-tight tabular-nums " +
          (positive ? "text-emerald-400" : "text-rose-400")
        }
      >
        {data ? fmtUsd(net, { sign: true }) : "…"}
      </motion.div>
      {data && (
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-zinc-800/80 pt-4">
          <Stat label="Charges" value={fmtUsd(data.charges)} tone="positive" />
          <Stat label="Refunds" value={fmtUsd(data.refunds)} />
          <Stat label="Ad spend" value={fmtUsd(data.adSpend)} />
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive";
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div
        className={
          "mt-0.5 font-semibold tabular-nums " +
          (tone === "positive" ? "text-emerald-300" : "text-zinc-200")
        }
      >
        {value}
      </div>
    </div>
  );
}
