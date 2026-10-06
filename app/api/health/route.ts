import { MODEL_ID } from "@/lib/app-info";
import { checkConfig, getConfig } from "@/lib/config";
import { probeDataset } from "@/lib/db";
import { toAppError } from "@/lib/errors";
import { jsonResponse, withRoute } from "@/lib/http";

/**
 * GET /api/health
 *
 * Reports configuration and database state without leaking secrets, hosts or
 * raw error text. HTTP 200 with status "ok" or "degraded" (the app runs but
 * `npm run db:migrate` has not been applied); 503 with status "error" when
 * configuration is invalid or the database cannot be reached.
 */
export const GET = withRoute("health", async (request, { log }) => {
  const config = checkConfig();
  if (!config.ok) {
    return jsonResponse(
      {
        status: "error",
        checks: {
          config: { ok: false, missing: config.missing, invalid: config.invalid },
          database: { ok: false, skipped: true },
        },
        model: MODEL_ID,
      },
      { status: 503 },
    );
  }

  const started = performance.now();
  try {
    const dataset = await probeDataset({ signal: request.signal });
    const latencyMs = Math.round(performance.now() - started);
    const status = dataset.hasTypedDateColumns ? "ok" : "degraded";
    return jsonResponse({
      status,
      checks: {
        config: { ok: true, readOnlyRole: getConfig().usingReadOnlyRole },
        database: { ok: true, latencyMs },
        schema: {
          ok: dataset.hasTypedDateColumns,
          ...(dataset.hasTypedDateColumns ? {} : { hint: "Run `npm run db:migrate`." }),
        },
      },
      dataset: { rows: dataset.rowCount, database: dataset.databaseName ?? null },
      model: MODEL_ID,
    });
  } catch (err) {
    const appError = toAppError(err);
    log.error("health check failed", { err: appError.cause ?? appError, code: appError.code });
    return jsonResponse(
      {
        status: "error",
        checks: {
          config: { ok: true },
          database: { ok: false, error: appError.code },
        },
        model: MODEL_ID,
      },
      { status: 503 },
    );
  }
});
