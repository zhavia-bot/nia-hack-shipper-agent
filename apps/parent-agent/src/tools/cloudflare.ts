import { env } from "../env.js";
import { getCloudflareToken } from "../run-context.js";

/**
 * Cloudflare API helpers. Two distinct tokens (P1 #11): a DNS-edit token
 * scoped to one zone for record management, and a Registrar token for
 * domain purchases. Mixing them is a privilege-escalation footgun.
 */
const CF_API = "https://api.cloudflare.com/client/v4";

async function cfFetch(token: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${CF_API}${path}`, { ...init, headers });
  const json = (await res.json()) as { success: boolean; errors?: unknown[]; result?: unknown };
  if (!res.ok || !json.success) {
    throw new Error(
      `Cloudflare ${init.method ?? "GET"} ${path} failed: ${JSON.stringify(json.errors)}`
    );
  }
  return json.result;
}

export const cloudflare = {
  /** DNS token only. */
  async upsertCnameRecord(args: { hostname: string; target: string }) {
    const token = getCloudflareToken("dns");
    const zone = env().CLOUDFLARE_ZONE_ID;
    return cfFetch(token, `/zones/${zone}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: "CNAME",
        name: args.hostname,
        content: args.target,
        ttl: 300,
        proxied: false,
      }),
    });
  },

  /** Registrar token only — used when promoting a tenant to a custom apex. */
  async registerDomain(args: { domain: string }) {
    const token = getCloudflareToken("registrar");
    return cfFetch(token, `/registrar/domains/${args.domain}`, {
      method: "PUT",
      body: JSON.stringify({ enabled: true, auto_renew: true }),
    });
  },
};
