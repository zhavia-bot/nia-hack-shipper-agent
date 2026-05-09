/**
 * Typed error classes for failure-model handling (`docs/stack.md` §8).
 * Catch by class, not by string match.
 */
export class BudgetError extends Error {
  constructor(
    public readonly code:
      | "HALTED"
      | "PER_EXP_CAP"
      | "PER_GEN_CAP"
      | "PER_DAY_CAP"
      | "OVERSPEND",
    message: string
  ) {
    super(message);
    this.name = "BudgetError";
  }
}

export class IdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityError";
  }
}

export class StripeActionDeniedError extends Error {
  constructor(public readonly attempted: string) {
    super(`stripe action not allowed: ${attempted}`);
    this.name = "StripeActionDeniedError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(public readonly stripeEventId: string) {
    super(`event already processed: ${stripeEventId}`);
    this.name = "IdempotencyConflictError";
  }
}
