import { NextResponse, type NextRequest } from "next/server";

/**
 * Subdomain → tenant rewrite. Wildcard CNAME `*.<apex>` lands here;
 * the visible URL stays at `exp-abc123.<apex>` while the resolved
 * route is `/_sites/<host>/...`. New tenants go live with a single
 * Convex insert — no Vercel deploy.
 *
 * Custom-domain promotion (`<bought-domain>` → tenant) goes through
 * the same path: the agent registers the domain on the project via
 * Vercel API, and `/_sites/<host>/page.tsx` looks the tenant up by
 * `customDomain` if the host is not a subdomain of the apex.
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

export default function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const host = (req.headers.get("host") || "").toLowerCase();

  // Strip the port for local-dev (e.g. `exp-abc.localhost:3000`).
  const bareHost = host.split(":")[0] ?? host;
  if (!bareHost) return NextResponse.next();

  // Skip rewriting if already rewritten or hitting an _-prefixed path.
  if (url.pathname.startsWith("/_sites/") || url.pathname === "/_") {
    return NextResponse.next();
  }

  url.pathname = `/_sites/${bareHost}${url.pathname}`;
  return NextResponse.rewrite(url);
}
