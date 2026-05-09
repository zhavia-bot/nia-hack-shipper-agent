import { Sandbox } from "@vercel/sandbox";
import { createLogger } from "@autoresearch/shared";

/**
 * Browser automation via `vercel-labs/agent-browser` running inside a Vercel
 * Sandbox microVM. Replaces the previous Browserbase BYOK path (P7.10).
 *
 * The Sandbox SDK authenticates with the Vercel OIDC token in production and
 * falls back to `VERCEL_TOKEN` locally — neither is BYOK. Sandbox CPU usage
 * bills the platform's Vercel account, not the user's; Hobby includes 5 free
 * active-CPU hours per month.
 *
 * `agent-browser` is installed via `npx -y` on first use; subsequent commands
 * inside the same sandbox reuse the cached install. Each step's stdout is the
 * raw CLI output (the JSON form when callers pass `--json`), captured as a
 * string for the workflow step's return value.
 */
const log = createLogger("tools.agent-browser");

export interface BrowserStep {
  cmd: string;
  args: string[];
}

export interface BrowserStepResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export const agentBrowser = {
  async run(
    steps: BrowserStep[],
    opts: { timeoutMs?: number } = {},
  ): Promise<{ sandboxId: string; results: BrowserStepResult[] }> {
    const sandbox = await Sandbox.create({
      runtime: "node24",
      timeout: opts.timeoutMs ?? 5 * 60 * 1000,
    });
    log.info("sandbox up", { sandboxId: sandbox.sandboxId });
    const results: BrowserStepResult[] = [];
    try {
      for (const s of steps) {
        const r = await sandbox.runCommand("npx", [
          "-y",
          "agent-browser",
          s.cmd,
          ...s.args,
        ]);
        results.push({
          exitCode: r.exitCode,
          stdout: await r.stdout(),
          stderr: await r.stderr(),
        });
        if (r.exitCode !== 0) {
          log.warn("agent-browser step non-zero exit", {
            sandboxId: sandbox.sandboxId,
            cmd: s.cmd,
            exitCode: r.exitCode,
          });
          break;
        }
      }
      return { sandboxId: sandbox.sandboxId, results };
    } finally {
      await sandbox.stop().catch(() => undefined);
    }
  },
};
