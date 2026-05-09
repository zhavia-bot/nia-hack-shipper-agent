/**
 * Structured JSON logger. One line per event, ingestable by Tensorlake's
 * trace UI and Vercel logs without further parsing. No deps on purpose —
 * this runs on every call path including hot loops.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  generation?: number;
  experimentId?: string;
  hypothesisId?: string;
  tenantSubdomain?: string;
  reservationId?: string;
  [key: string]: unknown;
}

export interface LoggerOptions {
  service: string;
  minLevel?: LogLevel;
  context?: LogContext;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  readonly service: string;
  private readonly minRank: number;
  private readonly baseContext: LogContext;

  constructor(opts: LoggerOptions) {
    this.service = opts.service;
    this.minRank = LEVEL_RANK[opts.minLevel ?? "info"];
    this.baseContext = opts.context ?? {};
  }

  child(extra: LogContext): Logger {
    return new Logger({
      service: this.service,
      minLevel: levelFromRank(this.minRank),
      context: { ...this.baseContext, ...extra },
    });
  }

  debug(msg: string, ctx?: LogContext): void {
    this.emit("debug", msg, ctx);
  }
  info(msg: string, ctx?: LogContext): void {
    this.emit("info", msg, ctx);
  }
  warn(msg: string, ctx?: LogContext): void {
    this.emit("warn", msg, ctx);
  }
  error(msg: string, ctx?: LogContext & { err?: unknown }): void {
    const errCtx = ctx?.err ? { ...ctx, err: serializeError(ctx.err) } : ctx;
    this.emit("error", msg, errCtx);
  }

  private emit(level: LogLevel, msg: string, ctx?: LogContext): void {
    if (LEVEL_RANK[level] < this.minRank) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      service: this.service,
      msg,
      ...this.baseContext,
      ...ctx,
    };
    const line = JSON.stringify(record);
    if (level === "error" || level === "warn") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }
}

function levelFromRank(rank: number): LogLevel {
  if (rank <= 10) return "debug";
  if (rank <= 20) return "info";
  if (rank <= 30) return "warn";
  return "error";
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { value: String(err) };
}

export function createLogger(service: string, context?: LogContext): Logger {
  const min = (process.env["LOG_LEVEL"] as LogLevel | undefined) ?? "info";
  return new Logger({ service, minLevel: min, context });
}
