import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { env } from "../env.js";

/**
 * Reacher MCP — trend signal, creator data, GMV time series for niche
 * selection. Used by `propose()` to bias buckets toward niches with
 * rising commerce activity.
 *
 * Constraint per `docs/stack.md` §4.5: write endpoints (`samples/request`,
 * `outreach/draft`) are sandboxed and don't dispatch. Treat as logging
 * only.
 */
const REACHER_MCP_URL = "https://api.reacherapp.com/mcp";

let cached: Client | null = null;

async function ensureClient(): Promise<Client> {
  if (cached) return cached;
  const transport = new StreamableHTTPClientTransport(new URL(REACHER_MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${env().REACHER_API_KEY}` },
    },
  });
  const c = new Client({ name: "autoresearch-parent-agent", version: "0.0.0" }, {
    capabilities: {},
  });
  await c.connect(transport);
  cached = c;
  return c;
}

export const reacher = {
  async listTools() {
    const c = await ensureClient();
    return c.listTools();
  },

  async callTool(name: string, args: Record<string, unknown>) {
    const c = await ensureClient();
    return c.callTool({ name, arguments: args });
  },

  /** Convenience — search for trending niches. Specific tool name is
   *  discoverable via listTools(); confirm at runtime. */
  async trendingNiches(args: { limit?: number } = {}) {
    return this.callTool("trending_niches", { limit: args.limit ?? 20 });
  },
};
