import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getKey } from "../run-context.js";

/**
 * Nia MCP — curated commerce / product knowledge corpus and the
 * `nia_deep_research_agent` "Oracle" tool. Used by `propose()` (P8.5)
 * to ground hypotheses in priors, and by the lessons pipeline to index
 * outcomes back into Nia so future generations have queryable memory.
 *
 * Auth: `Authorization: Bearer <api-key>` (the standard MCP convention).
 * Unlike Reacher there's no per-tenant shop id — one connection per BYOK
 * key is enough.
 *
 * Like reacher.ts, we cache the client per api key so concurrent runs
 * for different users do not share a transport (the key is baked into
 * the headers at connect time).
 */
const NIA_MCP_URL = "https://mcp.trynia.ai";

const clientsByKey = new Map<string, Client>();

async function ensureClient(): Promise<Client> {
  const key = getKey("nia");
  const cached = clientsByKey.get(key);
  if (cached) return cached;
  const transport = new StreamableHTTPClientTransport(new URL(NIA_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  });
  const c = new Client(
    { name: "autodrop-parent-agent", version: "0.0.0" },
    { capabilities: {} },
  );
  await c.connect(transport);
  clientsByKey.set(key, c);
  return c;
}

export const nia = {
  /** List MCP tools — call once at boot; tool names evolve. */
  async listTools() {
    const c = await ensureClient();
    return c.listTools();
  },

  /** Generic tool invocation; tool names are discovered via listTools(). */
  async callTool(name: string, args: Record<string, unknown> = {}) {
    const c = await ensureClient();
    return c.callTool({ name, arguments: args });
  },

  /**
   * Convenience wrapper for the Oracle deep-research tool. Returns the
   * raw MCP `content` blocks; callers stringify or json-parse as needed
   * for prompt grounding.
   */
  async deepResearch(query: string) {
    return nia.callTool("nia_deep_research_agent", { query });
  },

  /** Convenience wrapper for the hybrid corpus search. */
  async packageSearch(query: string, opts?: { topK?: number }) {
    return nia.callTool("nia_package_search_hybrid", {
      query,
      ...(opts?.topK != null ? { top_k: opts.topK } : {}),
    });
  },
};
