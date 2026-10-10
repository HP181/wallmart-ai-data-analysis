import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";
import { runAnalysis, toModelView, type AnalysisResult } from "@/lib/analysis";
import { getConfig } from "@/lib/config";
import { runReadQuery } from "@/lib/db";
import { toAppError } from "@/lib/errors";
import { taskLogger } from "@/lib/http";
import { chartConfigSchema } from "@/lib/query/chart-schema";
import { querySpecSchema } from "@/lib/query/spec";

/**
 * The analyst's only data tool. The model describes WHAT it wants (which
 * groupings, which measures, which filters) from a fixed catalog; the server
 * compiles that into a parameterized SELECT. The model never writes SQL.
 */

/**
 * Per-session count of consecutive failed analysis calls (in-process).
 * Cleared on success; alerts when a session exceeds the threshold. Helps detect
 * a confused or looping model before it runs up the AI bill.
 */
const consecutiveFailures = new Map<string, number>();
const FAILURE_ALERT_THRESHOLD = 3;

export default defineTool({
  description:
    "Query the Walmart sales table. Choose dimensions (group-by columns), metrics (measures), optional " +
    "filters, and a chart. Use only IDs listed in the instructions. If it returns success=false, read " +
    "`error`, fix the query or chartConfig, and call again (up to 3 retries).",
  inputSchema: z.object({
    query: querySpecSchema,
    chartConfig: chartConfigSchema,
  }),
  async execute({ query, chartConfig }, ctx) {
    const sessionId = ctx.session.id;
    const log = taskLogger({ tool: "analyzeData", callId: ctx.callId, sessionId });

    let maxRows: number;
    let toolTimeoutMs: number;
    try {
      const config = getConfig();
      maxRows = config.maxQueryRows;
      toolTimeoutMs = config.toolTimeoutMs;
    } catch (err) {
      // Misconfiguration is the operator's problem; give the model a clean message.
      const appError = toAppError(err);
      log.error("analysis unavailable: invalid configuration", { err });
      const unavailable: AnalysisResult = {
        success: false,
        error: appError.message,
        sql: "",
        chartConfig: {
          type: chartConfig.type,
          xKey: chartConfig.xKey ?? "",
          yKey: chartConfig.yKey ?? "",
          title: chartConfig.title,
        },
        chartWarnings: [],
        rows: [],
        columns: [],
        rowCount: 0,
        truncated: false,
      };
      return unavailable;
    }

    // Composite abort signal: honour the eve turn signal AND enforce a hard
    // per-tool timeout as a belt-and-suspenders guard above DB_QUERY_TIMEOUT_MS.
    const toolTimeoutSignal = AbortSignal.timeout(toolTimeoutMs);
    const toolSignal =
      ctx.abortSignal
        ? AbortSignal.any([ctx.abortSignal, toolTimeoutSignal])
        : toolTimeoutSignal;

    const result = await runAnalysis(
      { query, chartConfig },
      {
        run: (statement) => runReadQuery(statement, { signal: toolSignal }),
        maxRows,
        log,
      },
    );

    // Track consecutive failures and alert when the model keeps failing.
    if (!result.success) {
      const count = (consecutiveFailures.get(sessionId) ?? 0) + 1;
      consecutiveFailures.set(sessionId, count);
      if (count >= FAILURE_ALERT_THRESHOLD) {
        log.warn("repeated analysis failures", {
          alert: "repeated_failures",
          sessionId,
          failureCount: count,
          error: result.error,
        });
      }
    } else {
      consecutiveFailures.delete(sessionId);
    }

    return result;
  },
  toModelOutput(output) {
    return toolOutput.json(toModelView(output));
  },
});
