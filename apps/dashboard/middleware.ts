import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic auth gate. Per stack.md §4.3 the dashboard is
 * "auth-walled (Clerk or basic-auth)" — basic-auth is the v1 choice
 * because the dashboard is for ~3 humans. Credentials live in
 * `DASHBOARD_BASIC_AUTH=user:password` env.
 *
 * If unset, the middleware refuses *all* traffic — fail-closed. This
 * prevents accidental public exposure of operational dollar figures.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export default function middleware(req: NextRequest) {
  const expected = process.env["DASHBOARD_BASIC_AUTH"];
  if (!expected) {
    return new NextResponse("Dashboard auth not configured.", { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice("Basic ".length));
    if (decoded === expected) return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="dashboard"' },
  });
}
