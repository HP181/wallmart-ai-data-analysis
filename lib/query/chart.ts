/**
 * Chart configuration types and validation.
 *
 * Dependency-free on purpose: the server uses it to validate the model's
 * chartConfig against the columns a query really returned, and the browser
 * uses the same function as a last line of defence before rendering.
 */

export const CHART_TYPES = ["bar", "line", "pie", "scatter", "histogram", "table"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export type ChartConfig = {
  type: ChartType;
  xKey: string;
  yKey: string;
  title: string;
};

export type ChartConfigInput = {
  type: ChartType;
  xKey?: string;
  yKey?: string;
  title?: string;
};

export type ChartResolution = {
  config: ChartConfig;
  /** Human-readable notes about anything that was changed or downgraded. */
  warnings: string[];
};

/** Thrown when the requested keys do not exist in the result. The model can fix this by retrying. */
export class ChartKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartKeyError";
  }
}

const MAX_PIE_SLICES = 12;

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type Rows = Record<string, unknown>[];

/** True when every non-null value in the column is a finite number, and at least one exists. */
function isNumericColumn(rows: Rows, key: string): boolean {
  let seen = 0;
  for (const row of rows) {
    const v = row[key];
    if (v === null || v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
    seen++;
  }
  return seen > 0;
}

function resolveKey(requested: string | undefined, columns: string[]): string | undefined {
  if (requested === undefined) return undefined;
  return (
    columns.find((c) => c === requested) ??
    columns.find((c) => c.toLowerCase() === requested.trim().toLowerCase())
  );
}

/**
 * Validate a chart configuration against the columns and rows actually returned.
 *
 *  - Unknown xKey/yKey: throws ChartKeyError (a wrong measure must never be
 *    silently substituted; the model should retry with a real column).
 *  - Data that cannot be drawn as requested (non-numeric y, negative pie
 *    values, ...): downgraded to a table or bar chart with a warning, so the
 *    user still sees their data instead of a broken chart.
 */
export function resolveChart(input: ChartConfigInput, columns: string[], rows: Rows): ChartResolution {
  const warnings: string[] = [];
  const title = input.title?.trim() || "Results";
  const asTable = (note?: string): ChartResolution => {
    if (note) warnings.push(note);
    return {
      config: { type: "table", xKey: columns[0] ?? "", yKey: columns[1] ?? columns[0] ?? "", title },
      warnings,
    };
  };

  if (input.type === "table") return asTable();

  const available = columns.join(", ") || "(none)";
  const xKey = resolveKey(input.xKey, columns);
  const yKey = resolveKey(input.yKey, columns);
  if (!xKey) {
    throw new ChartKeyError(
      `chartConfig.xKey ${JSON.stringify(input.xKey ?? null)} is not a returned column. Use one of: ${available}.`,
    );
  }
  if (!yKey) {
    throw new ChartKeyError(
      `chartConfig.yKey ${JSON.stringify(input.yKey ?? null)} is not a returned column. Use one of: ${available}.`,
    );
  }
  if (xKey === yKey) {
    throw new ChartKeyError(`chartConfig.xKey and yKey must be different columns (both were "${xKey}").`);
  }

  let type: ChartType = input.type;
  if (rows.length === 0) {
    return { config: { type, xKey, yKey, title }, warnings };
  }

  if (!isNumericColumn(rows, yKey)) {
    return asTable(`"${yKey}" does not contain numeric values, so a table is shown instead of a ${type} chart.`);
  }
  if (type === "scatter" && !isNumericColumn(rows, xKey)) {
    return asTable(`A scatter plot needs numeric "${xKey}" values, so a table is shown instead.`);
  }

  if (type === "pie") {
    const values = rows.map((r) => toFiniteNumber(r[yKey]) ?? 0);
    if (values.some((v) => v < 0) || values.reduce((a, b) => a + b, 0) <= 0) {
      type = "bar";
      warnings.push(`A pie chart needs positive values, so a bar chart is shown instead.`);
    } else if (rows.length > MAX_PIE_SLICES) {
      type = "bar";
      warnings.push(`A pie chart with ${rows.length} slices is unreadable, so a bar chart is shown instead.`);
    }
  }

  if (type === "line" && rows.length < 2) {
    type = "bar";
    warnings.push("A line chart needs at least two points, so a bar chart is shown instead.");
  }

  return { config: { type, xKey, yKey, title }, warnings };
}
