import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getKey } from "../run-context.js";

/**
 * Nia MCP — curated corpus of "what sells online" priors. The agent
 * grounds hypotheses in this corpus instead of GPT confabulations.
 * Index ~1000 documents at start of run (one-time setup).
 */
const NIA_MCP_URL = "https://api.nia.dev/mcp";

const clients = new Map<string, Client>();

async function ensureClient(): Promise<Client> {
  const key = getKey("nia");
  const existing = clients.get(key);
  if (existing) return existing;
  const transport = new StreamableHTTPClientTransport(new URL(NIA_MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${key}` },
    },
  });
  const c = new Client(
    { name: "autoresearch-parent-agent", version: "0.0.0" },
    { capabilities: {} }
  );
  await c.connect(transport);
  clients.set(key, c);
  return c;
}

export const nia = {
  async search(query: string, limit = 10) {
    const c = await ensureClient();
    return c.callTool({
      name: "search",
      arguments: { query, limit },
    });
  },

  async listTools() {
    const c = await ensureClient();
    return c.listTools();
  },
};
