import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server.js";

const http = httpRouter();

/**
 * Health endpoint for uptime monitoring. Stripe webhooks land at the
 * Vercel storefronts route (signing-secret protected) and forward into
 * Convex via mutation calls — they do NOT hit Convex HTTP directly,
 * because the signing secret lives in Vercel env, never in Convex.
 */
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({ ok: true, service: "convex" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }),
});

export default http;
