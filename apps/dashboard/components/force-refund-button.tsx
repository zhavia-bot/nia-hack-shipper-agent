"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@autodrop/convex/api";
import { RefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/confirm-modal";

interface RefundResult {
  matched: number;
  refunded: number;
  skipped: number;
  failed: number;
}

interface ForceRefundButtonProps {
  subdomain: string;
  variant?: "destructive" | "outline";
  size?: "sm" | "default";
  label?: string;
}

/**
 * Two-step destructive action: open modal, confirm, then POST. The
 * server route is the canonical authority — it re-checks ownership
 * and walks every paid PI on the connected account, so a stale UI
 * cannot leak rows or misattribute.
 */
export function ForceRefundButton({
  subdomain,
  variant = "destructive",
  size = "sm",
  label = "Force-refund all",
}: ForceRefundButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RefundResult | { error: string } | null>(null);
  const cancelByOwner = useMutation(api.tenants.cancelByOwner);

  async function run() {
    setBusy(true);
    try {
      // Kill the storefront first so any in-flight checkout fails fast.
      try {
        await cancelByOwner({ subdomain });
      } catch {
        /* tenant may already be killed — ignore */
      }
      const r = await fetch(
        `/api/operator/force-refund/${encodeURIComponent(subdomain)}`,
        { method: "POST" },
      );
      const body = await r.json();
      if (!r.ok) {
        setResult({ error: body.error ?? r.statusText });
      } else {
        setResult(body as RefundResult);
        setOpen(false);
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="inline-flex flex-col items-end gap-1">
        <Button
          variant={variant}
          size={size}
          className="gap-1.5"
          onClick={() => {
            setResult(null);
            setOpen(true);
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {label}
        </Button>
        {result && "matched" in result && (
          <span className="text-[11px] text-muted-foreground">
            Refunded {result.refunded}/{result.matched} (skipped {result.skipped}, failed {result.failed})
          </span>
        )}
        {result && "error" in result && (
          <span className="text-[11px] text-destructive">{result.error}</span>
        )}
      </div>

      <ConfirmModal
        open={open}
        title="Refund every paid order?"
        confirmLabel="Refund all"
        destructive
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={run}
        body={
          <div className="space-y-2">
            <p>
              This kills the storefront <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{subdomain}</code> and refunds every paid PaymentIntent on your connected Stripe account whose <code className="font-mono text-xs">metadata.tenantSubdomain</code> matches.
            </p>
            <p className="text-xs">
              The agent has no inventory, so this is the demo-safe settle path. Refunds may take a few seconds to settle on each PI.
            </p>
          </div>
        }
      />
    </>
  );
}
