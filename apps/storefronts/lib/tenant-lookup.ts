import "server-only";
import { api } from "@autodrop/convex/api";
import { convex } from "./convex.js";
import { env } from "./env.js";

export interface ResolvedTenant {
  _id: string;
  subdomain: string;
  hypothesisId: string;
  experimentId: string;
  generation: number;
  stripeProductId: string;
  stripePriceId: string;
  productSource: {
    marketplace: "temu" | "alibaba" | "1688";
    url: string;
    originalTitle: string;
    originalPriceUsd: number;
    scrapedImageStorageIds: string[];
  };
  adCreativeStorageIds: string[];
  displayCopy: {
    headline: string;
    subhead: string;
    bullets: string[];
    cta: string;
  };
  displayPriceUsd: number;
  customDomain?: string;
  status: "live" | "paused" | "killed";
}

/**
 * Resolve `host` (already lowercased, port-stripped) to a tenant.
 * Two modes: subdomain of apex (`exp-abc.<apex>`) or a fully custom
 * promoted domain. We collapse both into a `subdomain` lookup against
 * the same column for v1 — the agent stores `subdomain` for the
 * subdomain case and `customDomain` for the promoted case, but the
 * `tenants:bySubdomain` query resolves either via the same index.
 *
 * For now: if host endswith apex, strip and look up by subdomain.
 * Otherwise, look up by customDomain (a separate query helper —
 * future work; v1 only resolves subdomains).
 */
export async function resolveTenantByHost(
  host: string
): Promise<ResolvedTenant | null> {
  const apex = env().APEX_DOMAIN.toLowerCase();
  const apexSuffix = `.${apex}`;
  let subdomain: string;
  if (host === apex) return null; // bare apex has no tenant
  if (host.endsWith(apexSuffix)) {
    subdomain = host.slice(0, -apexSuffix.length);
  } else {
    // Custom-domain path: not yet wired (v1 ships subdomains only).
    return null;
  }
  if (!subdomain) return null;

  const t = (await convex().query(api.tenants.bySubdomain, {
    subdomain,
  })) as ResolvedTenant | null;
  if (!t) return null;
  if (t.status !== "live") return null;
  return t;
}
