/**
 * Local-dev entrypoint. In production this is replaced by a Vercel cron
 * trigger that calls the workflow directly (see workflows/run-generation.ts
 * + the cron config in P7.7). For local smoke-tests:
 *
 *   ACTING_USER_ID=<users:_id> pnpm tsx src/orchestrator.ts
 *
 * Runs ONE generation and exits. No while-loop, no kill-switch poll
 * loop — the schedule lives outside the process.
 */
import { runGeneration } from "./workflows/run-generation.js";
import { createLogger } from "@autoresearch/shared";

const log = createLogger("parent-agent.entrypoint");

const actingUserId = process.env["ACTING_USER_ID"];
if (!actingUserId) {
  console.error(
    "ACTING_USER_ID env var required. Pass the Convex users:_id of " +
      "the user whose Stripe + BYOK keys this run should use.",
  );
  process.exit(1);
}

runGeneration(actingUserId)
  .then((res) => {
    log.info("generation finished", {
      generation: res.generation,
      outcomes: res.outcomes.length,
      halted: res.halted,
    });
    process.exit(0);
  })
  .catch((err) => {
    log.error("generation crashed", {
      err: err instanceof Error ? err.stack : String(err),
    });
    process.exit(1);
  });
