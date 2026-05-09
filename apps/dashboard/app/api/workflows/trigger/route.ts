import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@autoresearch/convex/api";

/**
 * POST /api/workflows/trigger
 *
 * Fires one `runGeneration` workflow for the authenticated user. In
 * production this calls `start(runGeneration, [actingUserId])` from
 * `workflow/api`, which enqueues a durable workflow run on Vercel's
 * runtime. For local dev without the workflow runtime, this returns 501
 * — kick off the agent manually with:
 *
 *   ACTING_USER_ID=<users:_id> pnpm --filter @autoresearch/parent-agent dev
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

  // In production this becomes:
  //   const { start } = await import('workflow/api');
  //   const { runGeneration } = await import('@autoresearch/parent-agent/workflows/run-generation');
  //   const run = await start(runGeneration, [me._id]);
  //   return NextResponse.json({ runId: run.id });
  //
  // The workflow runtime + plugin must be enabled in the Vercel project for
  // start() to succeed. Until that's wired up (P7.7 follow-up), surface a
  // clear 501 instead of pretending success.
  return NextResponse.json(
    {
      error:
        "Workflow runtime not wired up in this environment. Run the agent " +
        "locally with ACTING_USER_ID=" +
        me._id +
        " pnpm --filter @autoresearch/parent-agent dev",
      actingUserId: me._id,
    },
    { status: 501 },
  );
}
