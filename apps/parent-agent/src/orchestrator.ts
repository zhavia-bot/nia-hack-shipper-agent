import { application } from "@tensorlake/sdk";
import { HypothesisSchema, type Lesson, type Tenant } from "@autoresearch/schemas";
import { createLogger } from "@autoresearch/shared";
import { propose } from "./propose.js";
import { runChild } from "./child.js";
import { selectAndClassify, type ChildOutcome } from "./select.js";
import { distillLessonsForGeneration } from "./lessons.js";
import { killSwitchTripped } from "./budget.js";
import { convexClient } from "./tools/convex-client.js";
import { env } from "./env.js";

const log = createLogger("parent-agent.orchestrator");

const DEFAULT_BATCH_SIZE = 6;
const MAX_BATCH_SIZE = 8;
const HALT_POLL_INTERVAL_MS = 30_000;

/**
 * Tensorlake `@application` — long-lived, restarts from snapshot. Owns
 * the autoresearch loop end-to-end. Per-child concurrency capped at 8
 * (Tensorlake quota); each child gets its own sandbox and explicit
 * secret subset.
 */
export const orchestrator = application(
  { name: "autoresearch-money-parent", memoryMb: 1024 },
  async () => {
    log.info("orchestrator starting", { apex: env().APEX_DOMAIN });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const halt = await killSwitchTripped();
      if (halt.halt) {
        log.warn("kill switch engaged — pausing", { reason: halt.reason });
        await sleep(HALT_POLL_INTERVAL_MS);
        continue;
      }

      const generation = await convexClient().mutation<number>(
        "system:nextGeneration",
        {}
      );
      log.info("generation start", { generation });

      const lessons = (await convexClient().query("lessons:topWeighted", {
        limit: 50,
      })) as Lesson[];
      const liveTenants = (await convexClient().query("tenants:byStatus", {
        status: "live",
      })) as Tenant[];

      const batchSize = chooseBatchSize();
      const hypotheses = await propose({
        generation,
        batchSize,
        lessons,
        liveTenants,
      });

      // Schema-validate. NOTE: aggregate budget pre-check is deliberately
      // ABSENT — children reserve atomically inside runChild() (§5.7). A
      // reviewer flagged the pre-check pattern as race-prone (P0 #3).
      for (const h of hypotheses) HypothesisSchema.parse(h);

      log.info("fan-out children", {
        generation,
        count: hypotheses.length,
      });

      const outcomes = await Promise.allSettled(
        hypotheses.map((h) => runChild(h))
      );

      const childOutcomes: PromiseSettledResult<ChildOutcome>[] =
        outcomes.map((o) =>
          o.status === "fulfilled"
            ? {
                status: "fulfilled",
                value: {
                  experimentId: o.value.experimentId,
                  status: o.value.status,
                  error: o.value.error,
                },
              }
            : { status: "rejected", reason: o.reason }
        );

      for (const out of childOutcomes) {
        await selectAndClassify(out);
      }

      await distillLessonsForGeneration(generation);
      await convexClient().mutation("system:snapshotGeneration", { generation });

      log.info("generation complete", { generation });
    }
  }
);

function chooseBatchSize(): number {
  // Reserved knob — could vary based on time-of-day, recent crash rate,
  // budget headroom. v1 uses a static default within Tensorlake's quota.
  return Math.min(DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tensorlake bootstrap: import this module to start the application.
export default orchestrator;
