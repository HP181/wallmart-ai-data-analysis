import type { Instrumentation } from "next";

/**
 * Runs once when the server starts. Logs configuration problems immediately
 * (instead of at the first failing request) but never prevents startup, so
 * /api/health can still report what is wrong.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ checkConfig }, { logger }] = await Promise.all([import("@/lib/config"), import("@/lib/logger")]);
  const result = checkConfig();
  if (result.ok) {
    logger.info("server started", { readOnlyRole: Boolean(process.env.DATABASE_URL_READONLY) });
  } else {
    logger.error("invalid configuration", { missing: result.missing, invalid: result.invalid });
  }
}

/** Server errors Next.js catches outside our route wrapper (rendering, actions). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("@/lib/logger");
  logger.error("unhandled request error", {
    err,
    digest: typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined,
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
