import Stripe from "stripe";
import { StripeActionDeniedError } from "@autodrop/shared";
import { env } from "../env.js";

/**
 * Stripe action allowlist (defense-in-depth on top of the restricted
 * key). Per `docs/stack.md` §10.2: restricted keys are resource-level,
 * not action-level. To enforce "no updates, no refunds, no transfers"
 * we (1) configure agent surfaces to only expose allowed methods, and
 * (2) wrap the Stripe SDK in a Proxy that throws on any other path.
 *
 * The agent CANNOT bypass this without modifying source — the allowlist
 * is hardcoded here and this file is in the immutable substrate.
 */
export const ALLOWED_STRIPE_ACTIONS: ReadonlySet<string> = new Set([
  "products.create",
  "prices.create",
  "checkout.sessions.create",
  "checkout.sessions.retrieve",
  "events.list",
  "events.retrieve",
]);

const PASSTHROUGH_PROPS: ReadonlySet<string | symbol> = new Set([
  // Stripe SDK / Node internals we should never block.
  Symbol.toPrimitive,
  Symbol.toStringTag,
  Symbol.iterator,
  "then",
  "catch",
  "finally",
  "constructor",
  "toJSON",
  "toString",
  "_request",
  "_api",
  "_emitter",
]);

function wrapResource(target: any, basePath: string): any {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (PASSTHROUGH_PROPS.has(prop)) return Reflect.get(t, prop, receiver);
      const propName = String(prop);
      const path = basePath ? `${basePath}.${propName}` : propName;
      const value = Reflect.get(t, prop, receiver);

      if (typeof value === "function") {
        if (!ALLOWED_STRIPE_ACTIONS.has(path)) {
          return () => {
            throw new StripeActionDeniedError(path);
          };
        }
        return value.bind(t);
      }

      if (value && typeof value === "object") {
        return wrapResource(value, path);
      }
      return value;
    },
  });
}

let stripeCached: Stripe | null = null;
function rawStripe(): Stripe {
  if (!stripeCached) {
    stripeCached = new Stripe(env().STRIPE_RESTRICTED_KEY, {
      apiVersion: "2025-08-27.basil",
      typescript: true,
    });
  }
  return stripeCached;
}

let wrappedCached: Stripe | null = null;
export function stripeClient(): Stripe {
  if (!wrappedCached) wrappedCached = wrapResource(rawStripe(), "");
  return wrappedCached!;
}

/**
 * Deterministic facade — what the child function actually calls. Limits
 * the agent's Stripe surface to what the design explicitly needs. Adding
 * a method here is a code review event.
 */
export const stripe = {
  async createProductAndPrice(args: {
    name: string;
    description?: string;
    unitAmountCents: number;
    currency: string;
  }): Promise<{ productId: string; priceId: string }> {
    if (args.unitAmountCents < 100) {
      throw new Error("price floor: minimum $1 (100 cents)");
    }
    if (args.unitAmountCents > 9900) {
      throw new Error("price ceiling: maximum $99 (9900 cents)");
    }
    const product = await stripeClient().products.create({
      name: args.name,
      description: args.description,
    });
    const price = await stripeClient().prices.create({
      product: product.id,
      unit_amount: args.unitAmountCents,
      currency: args.currency,
    });
    return { productId: product.id, priceId: price.id };
  },

  async listRecentEvents(limit = 100) {
    return stripeClient().events.list({ limit });
  },

  async retrieveSession(sessionId: string) {
    return stripeClient().checkout.sessions.retrieve(sessionId);
  },
};
