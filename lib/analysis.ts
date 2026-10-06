import type { Row, Statement } from "@/lib/db";
import { AppError, toAppError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import {
  ChartKeyError,
  resolveChart,
  type ChartConfig,
  type ChartConfigInput,
} from "@/lib/query/chart";
import { compileQuery, normalizeRows } from "@/lib/query/compile";

/**
 * The analyst's one capability: run a structured query and shape the result
 * for the chat UI and the model. Pure orchestration; the database runner is
 * injected so tests can use an in-process Postgres.
 */

export type AnalysisResult = {
  success: boolean;
  /** Present when success is false. Safe to show to the user and the model. */
  error?: string;
  /** The SQL that ran, with values inlined. Display only. */
  sql: string;
  chartConfig: ChartConfig;
  /** Notes about charts that were downgraded (e.g. non-numeric values). */
  chartWarnings: string[];
  rows: Row[];
  columns: string[];
  rowCount: number;
  /** True when more rows matched than were returned. */
  truncated: boolean;
  /** Extra guidance for the model, e.g. why a result is empty. */
  hint?: string;
};

export type AnalysisDeps = {
  run: (statement: Statement) => Promise<Row[]>;
  maxRows: number;
  log: Logger;
};

function failure(error: string, chartInput: ChartConfigInput, sql = ""): AnalysisResult {
  return {
    success: false,
    error,
    sql,
    chartConfig: {
      type: chartInput.type,
      xKey: chartInput.xKey ?? "",
      yKey: chartInput.yKey ?? "",
      title: chartInput.title ?? "",
    },
    chartWarnings: [],
    rows: [],
    columns: [],
    rowCount: 0,
    truncated: false,
  };
}

export async function runAnalysis(
  input: { query: unknown; chartConfig: ChartConfigInput },
  deps: AnalysisDeps,
): Promise<AnalysisResult> {
  const { chartConfig: chartInput } = input;
  const started = performance.now();
  const queryShape = (() => {
    const q = input.query as { dimensions?: unknown[]; metrics?: unknown[]; filters?: unknown[] } | null;
    return {
      dimensions: q?.dimensions ?? [],
      metrics: q?.metrics ?? [],
      filters: Array.isArray(q?.filters) ? q.filters.length : 0,
    };
  })();

  // 1. Validate and compile. Failures here are the model's to fix.
  let compiled;
  try {
    compiled = compileQuery(input.query, { maxRows: deps.maxRows });
  } catch (err) {
    const appError = toAppError(err);
    deps.log.warn("analysis rejected", { ...queryShape, code: appError.code, reason: appError.message });
    return failure(appError.message, chartInput);
  }

  // 2. Run it.
  let fetched: Row[];
  try {
    fetched = await deps.run(compiled.statement);
  } catch (err) {
    const appError: AppError = toAppError(err);
    deps.log.error("analysis query failed", {
      ...queryShape,
      err: appError.cause ?? appError,
      code: appError.code,
      durationMs: Math.round(performance.now() - started),
    });
    const advice =
      appError.code === "db_timeout"
        ? " Try fewer dimensions, add a filter, or reduce the date range."
        : "";
    return failure(appError.message + advice, chartInput, compiled.displaySql);
  }

  const truncated = fetched.length > compiled.limit;
  const rows = normalizeRows(fetched.slice(0, compiled.limit), compiled.columns);
  const columnIds = compiled.columns.map((c) => c.id);

  // 3. Validate the chart against what actually came back.
  let resolved;
  try {
    resolved = resolveChart(chartInput, columnIds, rows);
  } catch (err) {
    if (err instanceof ChartKeyError) {
      deps.log.warn("analysis chart rejected", { ...queryShape, reason: err.message });
      return failure(err.message, chartInput, compiled.displaySql);
    }
    throw err;
  }

  deps.log.info("analysis complete", {
    ...queryShape,
    rowCount: rows.length,
    truncated,
    chartType: resolved.config.type,
    chartWarnings: resolved.warnings.length,
    durationMs: Math.round(performance.now() - started),
  });

  const result: AnalysisResult = {
    success: true,
    sql: compiled.displaySql,
    chartConfig: resolved.config,
    chartWarnings: resolved.warnings,
    rows,
    columns: columnIds,
    rowCount: rows.length,
    truncated,
  };
  if (rows.length === 0) {
    result.hint =
      "No rows matched. Text filters are case-sensitive and must use the exact values from the instructions; widen or remove a filter.";
  } else if (truncated) {
    result.hint = `Results were limited to ${compiled.limit} rows; more matched. Say so, or narrow the query.`;
  }
  return result;
}

/**
 * What the model sees. The UI gets the full result; the model gets at most
 * MODEL_ROW_LIMIT rows so a wide result cannot flood its context window.
 */
export const MODEL_ROW_LIMIT = 100;

export function toModelView(result: AnalysisResult): Record<string, unknown> {
  const shown = result.rows.slice(0, MODEL_ROW_LIMIT);
  return {
    success: result.success,
    ...(result.error ? { error: result.error } : {}),
    columns: result.columns,
    rowCount: result.rowCount,
    truncated: result.truncated,
    chartType: result.chartConfig.type,
    ...(result.chartWarnings.length ? { chartWarnings: result.chartWarnings } : {}),
    ...(result.hint ? { hint: result.hint } : {}),
    rows: shown,
    ...(result.rows.length > shown.length
      ? { rowsOmittedFromThisView: result.rows.length - shown.length }
      : {}),
  };
}
