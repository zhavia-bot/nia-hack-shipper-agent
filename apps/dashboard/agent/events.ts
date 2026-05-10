import { convexClient } from "./tools/convex-client.js";
import { currentContext } from "./run-context.js";
import { createLogger } from "@autodrop/shared";

const log = createLogger("parent-agent.events");

export type AgentEventLevel = "info" | "ok" | "warn" | "error";

export interface AgentEventInput {
  level: AgentEventLevel;
  kind: string;
  summary: string;
  generation?: number;
  experimentId?: string;
  hypothesisId?: string;
  tenantSubdomain?: string;
  payload?: unknown;
}

/**
 * P8.13 — narrate one agent decision point to the operator's live
 * stream. Fire-and-forget by default: the workflow keeps moving even
 * if the write blips. Inside `withRunContext`, `actingUserId` is
 * pulled from AsyncLocalStorage; outside, we silently skip rather
 * than spew anonymous rows into a multi-tenant table.
 *
 * Why a separate helper instead of plumbing through the structured
 * logger: the firehose JSON logs are coarse (every retry, every cache
 * hit). This stream is curated for the dashboard and worth the cost
 * of an explicit call site.
 */
export function recordAgentEvent(input: AgentEventInput): Promise<void> {
  const ctx = currentContext();
  if (!ctx) {
    log.warn("recordAgentEvent without run context — skipping", {
      kind: input.kind,
    });
    return Promise.resolve();
  }
  return convexClient()
    .mutation("agentEvents:record", {
      userId: ctx.actingUserId,
      level: input.level,
      kind: input.kind,
      summary: input.summary,
      generation: input.generation,
      experimentId: input.experimentId,
      hypothesisId: input.hypothesisId,
      tenantSubdomain: input.tenantSubdomain,
      payload: input.payload,
    })
    .then(() => undefined)
    .catch((err: unknown) => {
      log.warn("agentEvents:record failed; continuing", {
        kind: input.kind,
        err,
      });
    });
}
