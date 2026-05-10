"use client";

import { useState } from "react";
import { Loader, ShoppingBag } from "@/components/icons";
import { Button } from "@/components/ui/button";

export function CheckoutButton({ subdomain }: { subdomain: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subdomain }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`checkout failed (${res.status}): ${txt}`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("no checkout url");
      window.location.assign(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        onClick={go}
        disabled={loading}
        className="w-full text-base font-semibold"
      >
        {loading ? (
          <Loader className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ShoppingBag className="mr-2 h-4 w-4" />
        )}
        {loading ? "Redirecting…" : "Buy now"}
      </Button>
      {err && (
        <p className="text-xs text-destructive" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
