import { createLogger } from "@autoresearch/shared";
import { env } from "../env.js";

const log = createLogger("parent-agent.vercel");
const VERCEL_API = "https://api.vercel.com";

/**
 * Vercel REST helpers. We do NOT deploy per-tenant — the storefronts
 * project is a single multi-tenant Next.js app routed by subdomain.
 * The only Vercel calls the agent makes are domain-promotion ones for
 * winning tenants graduating to a custom apex.
 */
async function vercelFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${env().VERCEL_TOKEN}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${VERCEL_API}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel ${init.method ?? "GET"} ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

export const vercel = {
  async addCustomDomain(args: { domain: string }): Promise<void> {
    const projectId = env().VERCEL_STOREFRONTS_PROJECT_ID;
    log.info("adding custom domain", { domain: args.domain, projectId });
    await vercelFetch(`/v9/projects/${projectId}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: args.domain }),
    });
  },

  async removeCustomDomain(args: { domain: string }): Promise<void> {
    const projectId = env().VERCEL_STOREFRONTS_PROJECT_ID;
    await vercelFetch(`/v9/projects/${projectId}/domains/${args.domain}`, {
      method: "DELETE",
    });
  },

  async listDomains(): Promise<unknown> {
    const projectId = env().VERCEL_STOREFRONTS_PROJECT_ID;
    return vercelFetch(`/v9/projects/${projectId}/domains`);
  },
};
