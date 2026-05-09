import { env } from "../env.js";
import { getKey } from "../run-context.js";

/**
 * Browserbase — UI-only actions (signup flows, posts on platforms
 * without an API, scraping logged-in surfaces). Cost cap per
 * `docs/stack.md` §4.6: roughly $0.05 per 5-min session, capped at
 * $5/generation.
 *
 * v1 is a thin REST shim. The full Browserbase Node SDK can replace this
 * later; for now we want explicit per-call audit hooks.
 */
const BB_API = "https://www.browserbase.com/v1";

async function bbFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("X-BB-API-Key", getKey("browserbase"));
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${BB_API}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`Browserbase ${path} → ${res.status}`);
  return res.json();
}

export const browserbase = {
  async createSession() {
    return bbFetch(`/sessions`, {
      method: "POST",
      body: JSON.stringify({ projectId: env().BROWSERBASE_PROJECT_ID }),
    });
  },

  async closeSession(sessionId: string) {
    return bbFetch(`/sessions/${sessionId}`, { method: "DELETE" });
  },
};
