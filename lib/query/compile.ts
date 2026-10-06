import type { Row, Statement } from "@/lib/db";
import { invalidQuery } from "@/lib/errors";
import { DIMENSIONS, METRICS, filterFieldInfo, type ValueKind } from "@/lib/query/catalog";
import { checkFilterArity, coerceValue, parseQuerySpec, type TypedValue } from "@/lib/query/spec";

/**
 * Compile a validated QuerySpec into one parameterized SELECT.
 *
 * Safety properties (each one is asserted in compile.test.ts):
 *  - Every identifier and SQL fragment comes from the catalog, selected by
 *    an enum-validated ID. No model or user string is ever concatenated.
 *  - Every filter value is a bind parameter with an explicit cast.
 *  - Output column aliases are the catalog IDs, so the caller knows the exact
 *    result shape before running anything.
 */

export type ColumnMeta = {
  id: string;
  role: "dimension" | "metric";
  kind: ValueKind;
};

export type CompiledQuery = {
  /** The statement to execute. Fetches limit + 1 rows so truncation can be detected. */
  statement: Statement;
  /** Result columns in order: dimensions first, then metrics. */
  columns: ColumnMeta[];
  /** Maximum rows to return to the caller. */
  limit: number;
  /** Human-readable SQL with values inlined. For display only, never executed. */
  displaySql: string;
};

const CAST: Record<ValueKind, string> = {
  text: "text",
  int: "int",
  float: "float8",
  date: "date",
};

const DEFAULT_RANKING_LIMIT = 50;

export function compileQuery(input: unknown, options: { maxRows: number }): CompiledQuery {
  const spec = parseQuerySpec(input);
  const params: unknown[] = [];
  const bind = (tv: TypedValue): string => {
    params.push(tv.value);
    return `$${params.length}::${CAST[tv.kind]}`;
  };

  const dimensions = [...new Set(spec.dimensions)];
  const metrics = [...new Set(spec.metrics)];

  const columns: ColumnMeta[] = [
    ...dimensions.map((id) => ({ id, role: "dimension" as const, kind: DIMENSIONS[id].kind })),
    ...metrics.map((id) => ({ id, role: "metric" as const, kind: METRICS[id].kind })),
  ];

  const selectList = [
    ...dimensions.map((id) => `${DIMENSIONS[id].select} AS ${id}`),
    ...metrics.map((id) => `${METRICS[id].expr} AS ${id}`),
  ].join(",\n       ");

  // WHERE
  const conditions = spec.filters.map((filter) => {
    checkFilterArity(filter);
    const { expr } = filterFieldInfo(filter.field);
    const values = filter.values.map((v) => coerceValue(filter.field, v));
    switch (filter.op) {
      case "eq":
        return `${expr} = ${bind(values[0])}`;
      case "neq":
        return `${expr} <> ${bind(values[0])}`;
      case "gte":
        return `${expr} >= ${bind(values[0])}`;
      case "lte":
        return `${expr} <= ${bind(values[0])}`;
      case "between":
        return `${expr} BETWEEN ${bind(values[0])} AND ${bind(values[1])}`;
      case "in":
        return `${expr} IN (${values.map(bind).join(", ")})`;
    }
  });

  // ORDER BY (positional, so aliases that shadow column names cannot confuse it)
  const orderTerms: string[] = [];
  const positionOf = (id: string) => columns.findIndex((c) => c.id === id) + 1;

  if (spec.orderBy) {
    const position = positionOf(spec.orderBy.field);
    if (position === 0) {
      throw invalidQuery(
        `orderBy field "${spec.orderBy.field}" must be one of the selected dimensions or metrics: ${columns
          .map((c) => c.id)
          .join(", ")}.`,
      );
    }
    orderTerms.push(`${position} ${spec.orderBy.direction === "asc" ? "ASC" : "DESC"}`);
  } else if (dimensions.length > 0) {
    const first = DIMENSIONS[dimensions[0]];
    if (first.ordered) {
      orderTerms.push(`${"orderBy" in first ? first.orderBy : "1"} ASC`);
    } else {
      orderTerms.push(`${dimensions.length + 1} DESC`); // rank by the first metric
    }
  }
  // Deterministic tie-breaks so paging and tests are stable.
  dimensions.forEach((_, i) => {
    const term = `${i + 1} ASC`;
    if (!orderTerms.includes(term) && !orderTerms.includes(`${i + 1} DESC`)) orderTerms.push(term);
  });

  // LIMIT
  const rankingFirst = dimensions.length > 0 && !DIMENSIONS[dimensions[0]].ordered;
  const defaultLimit = rankingFirst ? Math.min(DEFAULT_RANKING_LIMIT, options.maxRows) : options.maxRows;
  const limit = dimensions.length === 0 ? 1 : Math.min(spec.limit ?? defaultLimit, options.maxRows);
  params.push(limit + 1);
  const limitPlaceholder = `$${params.length}::int`;

  const text = [
    `SELECT ${selectList}`,
    "FROM walmart",
    conditions.length ? `WHERE ${conditions.join("\n  AND ")}` : null,
    dimensions.length ? `GROUP BY ${dimensions.map((_, i) => i + 1).join(", ")}` : null,
    orderTerms.length ? `ORDER BY ${orderTerms.join(", ")}` : null,
    `LIMIT ${limitPlaceholder}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const statement: Statement = { text, params };
  const displaySql = renderSqlForDisplay({ text, params: [...params.slice(0, -1), limit] });

  return { statement, columns, limit, displaySql };
}

/** Inline bind parameters as SQL literals. Display only: this output is never executed. */
export function renderSqlForDisplay(statement: Statement): string {
  return statement.text.replace(/\$(\d+)::(text|int|float8|date)/g, (_match, index: string, type: string) => {
    const value = statement.params[Number(index) - 1];
    if (typeof value === "number") return String(value);
    const literal = `'${String(value).replace(/'/g, "''")}'`;
    return type === "date" ? `DATE ${literal}` : literal;
  });
}

function normalizeValue(value: unknown, kind: ValueKind): unknown {
  if (value === null || value === undefined) return null;
  if (kind === "int" || kind === "float") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return typeof value === "string" ? value : String(value);
}

/**
 * Coerce driver output to the declared column kinds. Postgres NUMERIC and
 * BIGINT arrive as strings from some drivers; this guarantees charts get
 * real numbers and that the row shape matches `columns` exactly.
 */
export function normalizeRows(rows: Row[], columns: ColumnMeta[]): Row[] {
  return rows.map((row) => {
    const out: Row = {};
    for (const column of columns) out[column.id] = normalizeValue(row[column.id], column.kind);
    return out;
  });
}
