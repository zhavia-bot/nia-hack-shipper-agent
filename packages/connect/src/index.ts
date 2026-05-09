/**
 * Stripe Connect — Standard accounts via controller properties.
 *
 * Hackathon scope: no platform fee, no destination charges. Each user
 * onboards their own Standard account; charges land directly there.
 * The platform key is used only for account creation, account links,
 * and reading account status. Per-tenant Checkout Sessions are created
 * via `forConnectedAccount(accountId).checkout.sessions.create(...)`,
 * which injects the `Stripe-Account` header so the resource is created
 * on behalf of the connected account.
 *
 * NOT used for the platform's own keys (the agent's restricted key
 * still goes through the immutable `stripe-action-allowlist` Proxy in
 * `apps/parent-agent/src/tools/stripe.ts`). This package is for the
 * Connect surface only.
 */
import Stripe from "stripe";

const API_VERSION: Stripe.LatestApiVersion = "2025-08-27.basil";

let platformCache: Stripe | null = null;

/**
 * Platform Stripe client — uses the PLATFORM secret key. Creates
 * connected accounts, account links, login links. Never makes charges
 * directly.
 */
export function platformStripe(secretKey: string): Stripe {
  if (!platformCache) {
    platformCache = new Stripe(secretKey, {
      apiVersion: API_VERSION,
      typescript: true,
    });
  }
  return platformCache;
}

/** Reset the cached platform client. Tests / ops only. */
export function resetPlatformStripe(): void {
  platformCache = null;
}

export interface CreateAccountArgs {
  email: string;
  country: string; // ISO-3166-1 alpha-2, e.g. "US", "GB"
}

/**
 * Create a Standard connected account using controller properties.
 * Standard means the user manages their own dashboard, payouts,
 * disputes — we just create the account and direct them to onboard.
 *
 * Returns the account id (acct_*). Persist on the user row as
 * `stripeConnectedAccountId`.
 */
export async function createConnectedAccount(
  platformKey: string,
  { email, country }: CreateAccountArgs,
): Promise<{ accountId: string }> {
  const account = await platformStripe(platformKey).accounts.create({
    controller: {
      stripe_dashboard: { type: "full" },
      fees: { payer: "account" },
      losses: { payments: "stripe" },
      requirement_collection: "stripe",
    },
    country,
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  return { accountId: account.id };
}

export interface AccountLinkArgs {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}

/**
 * Generate a hosted onboarding URL. Single-use, ~5 minute TTL.
 * Redirect the user there; on completion Stripe sends them to
 * `returnUrl`. If they bail or the link expires, they hit `refreshUrl`
 * and we mint a new one.
 */
export async function createAccountLink(
  platformKey: string,
  { accountId, refreshUrl, returnUrl }: AccountLinkArgs,
): Promise<{ url: string; expiresAt: number }> {
  const link = await platformStripe(platformKey).accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return { url: link.url, expiresAt: link.expires_at };
}

/**
 * Login link — short-lived URL into the connected account's Stripe
 * dashboard. Use after onboarding when the user wants to manage
 * payouts / view disputes.
 */
export async function createLoginLink(
  platformKey: string,
  accountId: string,
): Promise<{ url: string }> {
  const link = await platformStripe(platformKey).accounts.createLoginLink(
    accountId,
  );
  return { url: link.url };
}

export interface AccountStatus {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsCurrentlyDue: string[];
  country: string | null;
}

/**
 * Read live account status. Source-of-truth for the dashboard's
 * onboarding banner: did they finish? what's still required?
 *
 * Webhook events (`account.updated`) are the realtime path — this is
 * for explicit reconciliation after returning from onboarding.
 */
export async function getAccountStatus(
  platformKey: string,
  accountId: string,
): Promise<AccountStatus> {
  const a = await platformStripe(platformKey).accounts.retrieve(accountId);
  return {
    accountId: a.id,
    chargesEnabled: a.charges_enabled,
    payoutsEnabled: a.payouts_enabled,
    detailsSubmitted: a.details_submitted,
    requirementsCurrentlyDue: a.requirements?.currently_due ?? [],
    country: a.country ?? null,
  };
}

/**
 * Stripe SDK instance scoped to a connected account. Every API call
 * made through it sets the `Stripe-Account` header, so resources
 * (products, prices, checkout sessions) are created on the connected
 * account — NOT the platform.
 *
 * Used by storefronts when minting a Checkout Session for a tenant.
 * Each call costs the connected account's Stripe usage, and funds
 * land in their balance.
 */
export function forConnectedAccount(
  platformKey: string,
  accountId: string,
): Stripe {
  return new Stripe(platformKey, {
    apiVersion: API_VERSION,
    typescript: true,
    stripeAccount: accountId,
  });
}

export type { Stripe };
