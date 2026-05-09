import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic auth gate for the operator console at /console/*.
 *
 * The marketing landing at `/` is public so hackathon judges (and
 * eventually anyone curious) can see the pitch + live $ ticker
 * without a password. Operational pages — ledger detail, experiment
 * controls, raw spend — live behind /console/* and require basic auth.
 *
 * Credentials live in `DASHBOARD_BASIC_AUTH=user:password` env. If
 * unset, the gate fails closed — prevents accidental exposure of
 * operational dollar figures.
 */
export const config = {
  matcher: ["/console/:path*"],
};

export default function middleware(req: NextRequest) {
  const expected = process.env["DASHBOARD_BASIC_AUTH"];
  if (!expected) {
    return new NextResponse("Console auth not configured.", { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice("Basic ".length));
    if (decoded === expected) return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="autoresearch console"' },
  });
}
