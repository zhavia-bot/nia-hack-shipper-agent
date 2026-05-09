import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { resolveTenantByHost } from "@/lib/tenant-lookup";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ subdomain: z.string().min(1).max(64) });

/**
 * Creates a Stripe Checkout Session per click (NOT a Payment Link).
 * The session carries:
 *   - `client_reference_id = experimentId` — primary attribution.
 *   - `metadata = { experimentId, hypothesisId, tenantSubdomain, generation }`
 *     — secondary attribution (mirrored into the ledger row by the
 *     webhook for cross-checking).
 *
 * Why per-click sessions: see stack.md §4.4.1. A shared Payment Link
 * cannot be attributed back to the experiment that generated the click.
 *
 * The success URL embeds a signed HMAC token (mintDeliverToken) so the
 * customer can fetch the deliverable on the same redirect — but the
 * server still verifies `payment_status === "paid"` before serving
 * bytes. The token isn't a capability, just a routing handle.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  // Defense in depth: even though the client sends the subdomain we
  // already know via Host, we re-resolve the tenant by the actual host
  // header so a malicious client can't pivot to another tenant's price.
  const host = (req.headers.get("host") || "").toLowerCase().split(":")[0] ?? "";
  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    return NextResponse.json({ error: "tenant not found" }, { status: 404 });
  }
  if (tenant.subdomain !== parsed.data.subdomain) {
    return NextResponse.json({ error: "subdomain mismatch" }, { status: 400 });
  }

  const apex = env().APEX_DOMAIN;
  const baseUrl = env().PUBLIC_BASE_URL ?? `https://${tenant.subdomain}.${apex}`;
  const successUrl = `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/?canceled=1`;

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: tenant.stripePriceId, quantity: 1 }],
    client_reference_id: tenant.experimentId,
    metadata: {
      experimentId: tenant.experimentId,
      hypothesisId: tenant.hypothesisId,
      tenantSubdomain: tenant.subdomain,
      generation: String(tenant.generation),
    },
    payment_intent_data: {
      metadata: {
        experimentId: tenant.experimentId,
        tenantSubdomain: tenant.subdomain,
      },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: false,
  });

  if (!session.url) {
    return NextResponse.json({ error: "no session url" }, { status: 502 });
  }
  return NextResponse.json({ url: session.url, id: session.id });
}
