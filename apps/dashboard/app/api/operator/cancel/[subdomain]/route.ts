import { NextResponse, type NextRequest } from "next/server";
import { api } from "@autodrop/convex/api";
import { convexAsUser } from "@/lib/convex-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/operator/cancel/[subdomain]
 *
 * Owner-only kill switch. Convex `tenants.cancelByOwner` enforces the
 * Clerk identity check; this route is a thin HTTP wrapper. Idempotent
 * — repeated calls on a killed tenant are no-ops.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ subdomain: string }> },
) {
  const { subdomain } = await params;
  let cx;
  try {
    cx = await convexAsUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await cx.mutation(api.tenants.cancelByOwner, { subdomain });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("not your tenant") ? 403 : 404;
    return NextResponse.json({ error: msg }, { status });
  }
  return NextResponse.json({ ok: true, subdomain, status: "killed" });
}
