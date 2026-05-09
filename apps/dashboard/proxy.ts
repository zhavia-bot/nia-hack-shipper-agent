import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Clerk auth gate for /console/* (the operator dashboard). The marketing
 * landing at `/`, the sign-in/up flows, and Clerk webhook ingress remain
 * public. Next 16 renamed `middleware.ts` → `proxy.ts` (named `proxy`
 * export) — same runtime behavior.
 */
const isProtected = createRouteMatcher(["/console(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};
