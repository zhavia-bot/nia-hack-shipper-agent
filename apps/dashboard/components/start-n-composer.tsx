"use client";

import { useState } from "react";
import { Loader, Rocket } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface Result {
  ok: boolean;
  message: string;
}

/**
 * Operator-side trigger for `runGeneration`. The current trigger
 * endpoint fires a single workflow at a time; if the operator wants N
 * generations they get fired sequentially with a small jitter so the
 * agent doesn't slam the bucket-stats query simultaneously.
 */
export function StartNComposer() {
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function trigger() {
    setBusy(true);
    setResult(null);
    let started = 0;
    let failed = 0;
    let lastErr: string | null = null;
    for (let i = 0; i < n; i++) {
      try {
        const r = await fetch("/api/workflows/trigger", { method: "POST" });
        const body = await r.json();
        if (!r.ok) {
          failed += 1;
          lastErr = body.error ?? r.statusText;
        } else {
          started += 1;
        }
      } catch (err) {
        failed += 1;
        lastErr = err instanceof Error ? err.message : String(err);
      }
      if (i < n - 1) await sleep(150 + Math.random() * 250);
    }
    setBusy(false);
    if (failed === 0) {
      setResult({ ok: true, message: `Started ${started} generation${started === 1 ? "" : "s"}.` });
    } else {
      setResult({
        ok: false,
        message: `Started ${started}, ${failed} failed${lastErr ? `: ${lastErr}` : ""}.`,
      });
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1 text-sm">
        <span className="text-muted-foreground">N =</span>
        <input
          type="number"
          min={1}
          max={8}
          value={n}
          onChange={(e) => setN(clamp(parseInt(e.target.value || "1", 10), 1, 8))}
          className="w-12 bg-transparent text-center font-mono text-sm outline-none"
        />
      </div>
      <Button onClick={trigger} disabled={busy} size="sm" className="gap-2">
        {busy ? <Loader className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
        {busy ? "Starting…" : `Start ${n} generation${n === 1 ? "" : "s"}`}
      </Button>
      {result && (
        <span
          className={
            result.ok
              ? "text-xs text-emerald-600"
              : "text-xs text-destructive"
          }
        >
          {result.message}
        </span>
      )}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
