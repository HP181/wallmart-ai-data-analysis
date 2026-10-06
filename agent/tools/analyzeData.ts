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
    const log = taskLogger({ tool: "analyzeData", callId: ctx.callId, sessionId: ctx.session.id });

    let maxRows: number;
    try {
      maxRows = getConfig().maxQueryRows;
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

    return runAnalysis(
      { query, chartConfig },
      {
        run: (statement) => runReadQuery(statement, { signal: ctx.abortSignal }),
        maxRows,
        log,
      },
    );
  },
  toModelOutput(output) {
    return toolOutput.json(toModelView(output));
  },
});
