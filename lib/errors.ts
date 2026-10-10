import { ConfigError } from "@/lib/config";

/**
 * Error model shared by the API routes and the analyst tool.
 *
 * The rule: only an AppError carries a message that is safe to show to a
 * user or a model. Anything else (driver errors, stack traces, connection
 * strings) is logged server-side and replaced with a generic message.
 */

export type ErrorCode =
  | "invalid_request"
  | "invalid_query"
  | "config_error"
  | "db_timeout"
  | "db_unavailable"
  | "schema_out_of_date"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  invalid_query: 400,
  config_error: 503,
  db_timeout: 504,
  db_unavailable: 503,
  schema_out_of_date: 503,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
  }
}

export const invalidRequest = (message: string) => new AppError("invalid_request", message);
export const invalidQuery = (message: string) => new AppError("invalid_query", message);

type PgLike = { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };

function pgCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const code = (err as PgLike).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Map any thrown value to an AppError whose message is safe to expose.
 * The original error is preserved as `cause` for logging only.
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ConfigError) {
    return new AppError(
      "config_error",
      "The server is not configured correctly. Check the health endpoint or server logs.",
      { cause: err },
    );
  }

  const code = pgCode(err);
  // https://www.postgresql.org/docs/current/errcodes-appendix.html
  if (code === "57014") {
    return new AppError("db_timeout", "The query took too long and was cancelled.", { cause: err });
  }
  if (code === "42703" || code === "42P01") {
    return new AppError(
      "schema_out_of_date",
      "The database schema is missing expected columns or tables. Run `npm run db:migrate`.",
      { cause: err },
    );
  }
  if (code === "28000" || code === "28P01" || code === "42501" || code?.startsWith("08")) {
    return new AppError("db_unavailable", "The database is unavailable.", { cause: err });
  }

  const name = typeof err === "object" && err !== null ? String((err as PgLike).name ?? "") : "";
  const message = typeof err === "object" && err !== null ? String((err as PgLike).message ?? "") : "";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|NeonDbError/i.test(`${name} ${message}`)) {
    return new AppError("db_unavailable", "The database is unavailable.", { cause: err });
  }
  // AbortSignal.timeout() throws DOMException("TimeoutError"); request cancellation throws
  // DOMException("AbortError"). Both mean the query did not complete within its budget.
  if (name === "TimeoutError" || name === "AbortError") {
    return new AppError("db_timeout", "The query took too long and was cancelled.", { cause: err });
  }

  return new AppError("internal_error", "Something went wrong. Please try again.", { cause: err });
}

export type ErrorBody = {
  error: { code: ErrorCode; message: string; requestId?: string };
};

export function errorBody(err: AppError, requestId?: string): ErrorBody {
  return { error: { code: err.code, message: err.message, ...(requestId ? { requestId } : {}) } };
}
