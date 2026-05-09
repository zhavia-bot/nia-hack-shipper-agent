import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P8.1 pivot: physical products have no digital deliverable. The
 * post-checkout settlement is the refund-all + apology email path
 * wired up in P8.10 — there is nothing to download. This route is
 * kept only so any stale receipt links return a clean 410 instead
 * of a 500.
 */
export async function GET() {
  return new NextResponse("digital deliverables are no longer issued", {
    status: 410,
  });
}
