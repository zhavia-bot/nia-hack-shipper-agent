import { ConvexHttpClient } from "convex/browser";
import { env } from "../env.js";

/**
 * Convex client with auto-injected agent token. Every mutation/query
 * call shape is `(name, args)` where `args` includes the token from env.
 *
 * Why a custom shape rather than the typed `api` import: keeping the
 * agent's call surface stringly-typed is intentional — it forces every
 * mutation to be explicitly named in the agent's audit trail and
 * prevents accidental coupling of the agent build to Convex codegen.
 */
class AgentConvexClient {
  private readonly http: ConvexHttpClient;

  constructor(url: string) {
    this.http = new ConvexHttpClient(url);
  }

  async mutation<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const withToken = { ...args, token: env().CONVEX_AGENT_TOKEN };
    return (await this.http.mutation(name as any, withToken)) as T;
  }

  async query<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const withToken = { ...args, token: env().CONVEX_AGENT_TOKEN };
    return (await this.http.query(name as any, withToken)) as T;
  }
}

let cached: AgentConvexClient | null = null;
export function convexClient(): AgentConvexClient {
  if (!cached) cached = new AgentConvexClient(env().CONVEX_URL);
  return cached;
}
