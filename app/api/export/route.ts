import { toCsvLine } from "@/lib/csv";
import { getConfig } from "@/lib/config";
import { runReadQuery, type Row } from "@/lib/db";
import { EXPORT_COLUMNS, buildExportBatch, parseRowFilters } from "@/lib/data/rows";
import { withRoute, jsonResponse } from "@/lib/http";
import { exportLimiter, getClientIp } from "@/lib/rate-limit";

/**
 * GET /api/export
 *
 * Streams the dataset as CSV in keyset batches, so memory use is one batch
 * (default 1,000 rows) regardless of table size. Accepts the same filter
 * parameters as /api/data, so "export what I'm looking at" works.
 *
 * The first batch is fetched before the response starts, so a database problem
 * becomes a proper JSON error instead of a download that silently stops.
 * If a later batch fails, the stream is errored so the client sees a failed
 * download rather than a truncated file that looks complete.
 */
/** Row count that triggers an export-volume observability alert. */
const EXPORT_ALERT_ROWS = 50_000;

export const GET = withRoute("export.csv", async (request, { log }) => {
  // Rate-limit exports: they are expensive (streaming full table scans).
  const ip = getClientIp(request.headers);
  const rateCheck = exportLimiter.check(ip);
  if (!rateCheck.allowed) {
    const retryAfter = String(Math.ceil(rateCheck.retryAfterMs / 1_000));
    return jsonResponse(
      { error: { code: "rate_limited", message: "Too many export requests. Please wait before trying again." } },
      { status: 429, headers: { "Retry-After": retryAfter } },
    );
  }

  const filters = parseRowFilters(new URL(request.url).searchParams);
  const { exportBatchSize, exportMaxRows } = getConfig();
  const encoder = new TextEncoder();

  const fetchBatch = (afterId: number) =>
    runReadQuery(buildExportBatch(filters, afterId, exportBatchSize), { signal: request.signal });

  let batch: Row[] | undefined = await fetchBatch(0);

  let sent = 0;
  let lastId = 0;
  let headerPending = true;
  let finished = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (finished) return;

        if (batch === undefined) batch = await fetchBatch(lastId);
        const rows = batch.slice(0, Math.max(0, exportMaxRows - sent));
        const exhausted = batch.length < exportBatchSize;
        const capped = rows.length < batch.length || sent + rows.length >= exportMaxRows;

        let chunk = headerPending ? toCsvLine([...EXPORT_COLUMNS]) : "";
        headerPending = false;
        for (const row of rows) chunk += toCsvLine(EXPORT_COLUMNS.map((c) => row[c]));
        if (chunk) controller.enqueue(encoder.encode(chunk));

        sent += rows.length;
        if (rows.length > 0) lastId = Number(rows[rows.length - 1].invoice_id);
        batch = undefined;

        if (exhausted || capped || rows.length === 0) {
          finished = true;
          if (capped && !exhausted) {
            log.warn("export truncated at EXPORT_MAX_ROWS", { rows: sent, max: exportMaxRows });
          }
          if (sent >= EXPORT_ALERT_ROWS) {
            log.warn("large export completed", { alert: "export_volume", rows: sent, ip });
          } else {
            log.info("export complete", { rows: sent });
          }
          controller.close();
        }
      } catch (err) {
        finished = true;
        log.error("export failed mid-stream", { err, rows: sent });
        controller.error(err);
      }
    },
    cancel() {
      finished = true;
      log.info("export cancelled by client", { rows: sent });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="walmart_cleaned_data.csv"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
