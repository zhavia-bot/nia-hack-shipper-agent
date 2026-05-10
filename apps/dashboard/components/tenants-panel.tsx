"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion } from "motion/react";
import { api } from "@autodrop/convex/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ForceRefundButton } from "@/components/force-refund-button";
import { Pause } from "@/components/icons";
import { fmtRelativeTime } from "@/lib/format";

/**
 * Operator panel: every tenant the current user owns. Convex `tenants.mine`
 * resolves identity via Clerk; the action endpoints re-check ownership
 * server-side so a stale page can't escalate.
 */
export function TenantsPanel() {
  const tenants = useQuery(api.tenants.mine, {});

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Tenants — operator controls
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tenants === undefined && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {tenants && tenants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No tenants yet. They&rsquo;ll appear here as the agent ships hypotheses.
          </p>
        )}
        {tenants && tenants.length > 0 && (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Subdomain</th>
                  <th className="px-4 py-2 font-medium">Headline</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t, i) => (
                  <motion.tr
                    key={t._id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16, delay: i * 0.02 }}
                    className="border-b last:border-b-0"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`https://${t.subdomain}.team.vercel.app`}
                        target="_blank"
                        className="font-mono text-xs text-foreground underline-offset-2 hover:underline"
                      >
                        {t.subdomain}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-foreground/80">
                      {t.displayCopy.headline}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {fmtRelativeTime(t.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <RowActions
                        subdomain={t.subdomain}
                        status={t.status}
                      />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: "live" | "paused" | "killed" }) {
  if (status === "live") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        live
      </Badge>
    );
  }
  if (status === "paused") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      >
        paused
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      killed
    </Badge>
  );
}

function RowActions({
  subdomain,
  status,
}: {
  subdomain: string;
  status: "live" | "paused" | "killed";
}) {
  const [busy, setBusy] = useState(false);
  const cancel = useMutation(api.tenants.cancelByOwner);

  async function kill() {
    setBusy(true);
    try {
      await cancel({ subdomain });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {status === "live" && (
        <Button size="xs" variant="outline" className="gap-1" onClick={kill} disabled={busy}>
          <Pause className="h-3 w-3" />
          {busy ? "Killing…" : "Kill"}
        </Button>
      )}
      <ForceRefundButton subdomain={subdomain} size="sm" label="Force-refund" />
    </div>
  );
}
