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
 *
 * For the small set of substrate-called endpoints (immutable
 * `agent/budget.ts`, `agent/revenue.ts`) we add string-literal overloads
 * here so the substrate keeps reading typed fields without per-call
 * assertions and without relying on Convex codegen.
 */

export interface ExperimentMetrics {
  _id: string;
  spendUsd: number;
  revenueUsd: number;
  visitors: number;
  conversions: number;
  asyncFailure?: boolean;
  disputed?: boolean;
  refunded?: boolean;
  status: "pending" | "keep" | "refine" | "discard" | "crash";
  generation: number;
  hypothesisId: string;
}

export interface KillSwitchState {
  halt: boolean;
  reason: string | null;
}

export interface RunKeysShape {
  aiGateway: string | null;
  resend: string | null;
  reacher: string | null;
  nia: string | null;
}

class AgentConvexClient {
  private readonly http: ConvexHttpClient;

  constructor(url: string) {
    this.http = new ConvexHttpClient(url);
  }

  // mutation overloads — substrate-called endpoints first, generic last
  mutation(name: "budget:reserve", args: object): Promise<string>;
  mutation(name: "budget:reportSpend", args: object): Promise<void>;
  mutation(name: "budget:finalize", args: object): Promise<void>;
  mutation(name: "budget:release", args: object): Promise<void>;
  mutation<T = unknown>(name: string, args: object): Promise<T>;
  async mutation<T = unknown>(name: string, args: object): Promise<T> {
    const withToken = { ...args, token: env().CONVEX_AGENT_TOKEN };
    return (await this.http.mutation(// eslint-disable-next-line @typescript-eslint/no-explicit-any
      name as any, withToken)) as T;
  }

  // query overloads — substrate-called endpoints first, generic last
  query(name: "system:killSwitchState", args: object): Promise<KillSwitchState>;
  query(name: "experiments:metrics", args: object): Promise<ExperimentMetrics | null>;
  query(name: "ledger:totalNet", args: object): Promise<number>;
  query(name: "users:keysForUser", args: object): Promise<RunKeysShape>;
  query<T = unknown>(name: string, args: object): Promise<T>;
  async query<T = unknown>(name: string, args: object): Promise<T> {
    const withToken = { ...args, token: env().CONVEX_AGENT_TOKEN };
    return (await this.http.query(// eslint-disable-next-line @typescript-eslint/no-explicit-any
      name as any, withToken)) as T;
  }
}

let cached: AgentConvexClient | null = null;
export function convexClient(): AgentConvexClient {
  if (!cached) cached = new AgentConvexClient(env().CONVEX_URL);
  return cached;
}
