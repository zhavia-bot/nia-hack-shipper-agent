import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { httpAction } from "./_generated/server.js";
import { internal } from "./_generated/api.js";

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

/**
 * Clerk webhook → user provisioning. Subscribed events: user.created,
 * user.updated, user.deleted. Signature verified via svix using the
 * CLERK_WEBHOOK_SECRET set on Convex env.
 *
 * `tokenIdentifier` shape (`${issuer}|${subject}`) mirrors what
 * `ctx.auth.getUserIdentity()` exposes on the authenticated query side,
 * so the Clerk-issued JWT later resolves to the same row.
 */
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env["CLERK_WEBHOOK_SECRET"];
    if (!secret) {
      return new Response("CLERK_WEBHOOK_SECRET not set", { status: 503 });
    }
    const issuer = process.env["CLERK_JWT_ISSUER_DOMAIN"];
    if (!issuer) {
      return new Response("CLERK_JWT_ISSUER_DOMAIN not set", { status: 503 });
    }

    const payload = await req.text();
    const headers = {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    };

    let event: { type: string; data: Record<string, unknown> };
    try {
      event = new Webhook(secret).verify(payload, headers) as typeof event;
    } catch {
      return new Response("invalid signature", { status: 400 });
    }

    const data = event.data as {
      id: string;
      email_addresses?: { email_address: string; id: string }[];
      primary_email_address_id?: string;
      first_name?: string | null;
      last_name?: string | null;
      image_url?: string;
    };

    if (event.type === "user.created" || event.type === "user.updated") {
      const primaryEmail = data.email_addresses?.find(
        (e) => e.id === data.primary_email_address_id,
      )?.email_address;
      const fullName = [data.first_name, data.last_name]
        .filter(Boolean)
        .join(" ") || undefined;
      await ctx.runMutation(internal.users.upsertFromClerk, {
        tokenIdentifier: `${issuer}|${data.id}`,
        clerkUserId: data.id,
        email: primaryEmail,
        name: fullName,
        imageUrl: data.image_url,
      });
    } else if (event.type === "user.deleted") {
      await ctx.runMutation(internal.users.deleteFromClerk, {
        clerkUserId: data.id,
      });
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
