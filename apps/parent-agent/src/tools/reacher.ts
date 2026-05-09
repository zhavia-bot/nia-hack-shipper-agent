import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { env } from "../env.js";

/**
 * Reacher MCP — trend signal, creator data, GMV time series for niche
 * selection. Used by `propose()` to bias buckets toward niches with
 * rising commerce activity.
 *
 * Per the Reacher hackathon setup (portal.reacherapp.com/docs/api):
 *   - Auth header: `x-api-key: rk_live_…`  (NOT `Authorization: Bearer`)
 *   - Per-request: `x-shop-id: <number>`. Required on every endpoint
 *     EXCEPT `GET /shops` (the discovery endpoint).
 *   - MCP endpoint: https://api.reacherapp.com/mcp
 *
 * Two-phase usage:
 *   1. `discoverShops()` — REST call, no shop_id needed. Returns the
 *      list of shops the key has access to.
 *   2. `forShop(shopId).callTool(...)` — opens an MCP connection with
 *      both headers. The connection is cached per shop_id.
 *
 * If `REACHER_SHOP_ID` is set in env, we skip discovery and use it.
 */
const REACHER_REST_BASE = "https://api.reacherapp.com/public/v1";
const REACHER_MCP_URL = "https://api.reacherapp.com/mcp";

export interface Shop {
  shop_id: number;
  name: string;
  region: string;
}

const clientsByShop = new Map<number, Client>();

function authHeaders(shopId?: number): Record<string, string> {
  const h: Record<string, string> = { "x-api-key": env().REACHER_API_KEY };
  if (shopId != null) h["x-shop-id"] = String(shopId);
  return h;
}

async function ensureClientForShop(shopId: number): Promise<Client> {
  const cached = clientsByShop.get(shopId);
  if (cached) return cached;
  const transport = new StreamableHTTPClientTransport(new URL(REACHER_MCP_URL), {
    requestInit: { headers: authHeaders(shopId) },
  });
  const c = new Client(
    { name: "autoresearch-parent-agent", version: "0.0.0" },
    { capabilities: {} }
  );
  await c.connect(transport);
  clientsByShop.set(shopId, c);
  return c;
}

/** Discovery — REST, no shop_id. Use this once at boot. */
async function discoverShops(): Promise<Shop[]> {
  const res = await fetch(`${REACHER_REST_BASE}/shops`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`reacher GET /shops failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as Shop[];
}

/**
 * Pick a default shop for this run. Honors `REACHER_SHOP_ID` env (set
 * once and forget); otherwise picks the first shop returned by
 * discovery. The chosen id is cached in-process.
 */
let defaultShopId: number | null = null;

async function getDefaultShopId(): Promise<number> {
  if (defaultShopId != null) return defaultShopId;
  const fromEnv = process.env["REACHER_SHOP_ID"];
  if (fromEnv) {
    const n = Number.parseInt(fromEnv, 10);
    if (!Number.isFinite(n)) throw new Error("REACHER_SHOP_ID must be numeric");
    defaultShopId = n;
    return n;
  }
  const shops = await discoverShops();
  if (shops.length === 0) throw new Error("reacher key has access to no shops");
  defaultShopId = shops[0]!.shop_id;
  return defaultShopId;
}

export const reacher = {
  discoverShops,

  /** Override the default shop (e.g., if the agent rotates niches). */
  setDefaultShop(shopId: number): void {
    defaultShopId = shopId;
  },

  /** List MCP tools — call this at boot to learn the actual tool names
   *  available on Reacher's MCP. Don't hardcode tool names; they evolve. */
  async listTools(shopId?: number) {
    const id = shopId ?? (await getDefaultShopId());
    const c = await ensureClientForShop(id);
    return c.listTools();
  },

  /** Generic tool invocation. Tool names are discovered via listTools(). */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    shopId?: number
  ) {
    const id = shopId ?? (await getDefaultShopId());
    const c = await ensureClientForShop(id);
    return c.callTool({ name, arguments: args });
  },
};
