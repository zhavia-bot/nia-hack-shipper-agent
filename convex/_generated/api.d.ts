/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_idempotent from "../_lib/idempotent.js";
import type * as _lib_identity from "../_lib/identity.js";
import type * as agentEvents from "../agentEvents.js";
import type * as auditLog from "../auditLog.js";
import type * as budget from "../budget.js";
import type * as dashboard from "../dashboard.js";
import type * as experiments from "../experiments.js";
import type * as http from "../http.js";
import type * as ledger from "../ledger.js";
import type * as lessons from "../lessons.js";
import type * as storage from "../storage.js";
import type * as system from "../system.js";
import type * as tenants from "../tenants.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/idempotent": typeof _lib_idempotent;
  "_lib/identity": typeof _lib_identity;
  agentEvents: typeof agentEvents;
  auditLog: typeof auditLog;
  budget: typeof budget;
  dashboard: typeof dashboard;
  experiments: typeof experiments;
  http: typeof http;
  ledger: typeof ledger;
  lessons: typeof lessons;
  storage: typeof storage;
  system: typeof system;
  tenants: typeof tenants;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
