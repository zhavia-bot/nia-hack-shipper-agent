import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { start } from "workflow/api";
import { api } from "@autoresearch/convex/api";
import { runGeneration } from "@/agent/workflows/run-generation";

/**
 * POST /api/workflows/trigger
 *
 * Fires one `runGeneration` workflow for the authenticated user. `start`
 * from `workflow/api` enqueues a durable run via Vercel Queues — the HTTP
 * request returns immediately while the workflow body executes in the
 * background, surviving deploys + crashes.
 */
export async function POST() {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await getToken({ template: "convex" });
  if (!token) {
    return NextResponse.json(
      { error: "No Convex token from Clerk" },
      { status: 500 },
    );
  }

  const convex = new ConvexHttpClient(process.env["NEXT_PUBLIC_CONVEX_URL"]!);
  convex.setAuth(token);
  const me = await convex.query(api.users.current, {});
  if (!me) {
    return NextResponse.json(
      { error: "User row not provisioned yet" },
      { status: 503 },
    );
  }

  const run = await start(runGeneration, [me._id]);
  return NextResponse.json({ runId: run.runId, actingUserId: me._id });
}
