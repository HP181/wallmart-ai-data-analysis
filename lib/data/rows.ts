import type { Row, Statement } from "@/lib/db";
import { invalidRequest } from "@/lib/errors";

/**
 * Server-side paging, sorting and filtering for the raw transaction table,
 * plus the keyset batches behind the streaming CSV export.
 *
 * As in lib/query, nothing request-derived is concatenated into SQL: sort
 * columns come from an allowlist, and every filter value is a bind parameter.
 */

/** Columns in the exported CSV, in order. Identical to the original export. */
export const EXPORT_COLUMNS = [
  "invoice_id",
  "branch",
  "city",
  "category",
  "unit_price",
  "quantity",
  "date",
  "time",
  "payment_method",
  "rating",
  "profit_margin",
  "total",
  "profit_amount",
  "year",
  "month",
  "month_name",
  "day_of_week",
  "week_number",
  "hour",
  "shift",
  "revenue_tier",
] as const;

/** Columns in the paged API: the export columns plus the typed date/time. */
export const LIST_COLUMNS = [...EXPORT_COLUMNS, "sale_date", "sale_time"] as const;

export type ListColumn = (typeof LIST_COLUMNS)[number];

const quote = (id: string) => `"${id}"`;

const EXPORT_SELECT = EXPORT_COLUMNS.map(quote).join(", ");
const LIST_SELECT =
  `${EXPORT_SELECT}, ` +
  `to_char(sale_date, 'YYYY-MM-DD') AS sale_date, ` +
  `to_char(sale_time, 'HH24:MI:SS') AS sale_time`;

export const TEXT_FILTER_FIELDS = [
  "category",
  "branch",
  "city",
  "payment_method",
  "shift",
  "day_of_week",
  "month_name",
  "revenue_tier",
] as const;
export type TextFilterField = (typeof TEXT_FILTER_FIELDS)[number];

/** Columns ILIKE-searched by the free-text `q` parameter. */
const SEARCH_FIELDS = TEXT_FILTER_FIELDS;

export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;
const MAX_OFFSET = 100_000;
const MAX_TEXT_LENGTH = 100;

export type RowFilters = {
  q?: string;
  text: Partial<Record<TextFilterField, string>>;
  year?: number;
  month?: number;
  dateFrom?: string;
  dateTo?: string;
};

export type RowsQuery = {
  filters: RowFilters;
  page: number;
  pageSize: number;
  sort: ListColumn;
  dir: "asc" | "desc";
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function intParam(params: URLSearchParams, name: string, min: number, max: number): number | undefined {
  const raw = params.get(name);
  if (raw === null || raw === "") return undefined;
  if (!/^-?\d+$/.test(raw)) throw invalidRequest(`"${name}" must be a whole number.`);
  const n = Number(raw);
  if (n < min || n > max) throw invalidRequest(`"${name}" must be between ${min} and ${max}.`);
  return n;
}

function textParam(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name);
  if (raw === null) return undefined;
  const value = raw.trim();
  if (value === "") return undefined;
  if (value.length > MAX_TEXT_LENGTH) {
    throw invalidRequest(`"${name}" must be at most ${MAX_TEXT_LENGTH} characters.`);
  }
  return value;
}

/** Filters only (no paging or sort). Used by the table API and the CSV export. */
export function parseRowFilters(params: URLSearchParams): RowFilters {
  const filters: RowFilters = { text: {} };

  const q = textParam(params, "q");
  if (q) filters.q = q;

  for (const field of TEXT_FILTER_FIELDS) {
    const value = textParam(params, field);
    if (value) filters.text[field] = value;
  }

  filters.year = intParam(params, "year", 1900, 2200);
  filters.month = intParam(params, "month", 1, 12);

  for (const [name, key] of [
    ["date_from", "dateFrom"],
    ["date_to", "dateTo"],
  ] as const) {
    const value = textParam(params, name);
    if (value === undefined) continue;
    if (!isRealDate(value)) throw invalidRequest(`"${name}" must be a date formatted YYYY-MM-DD.`);
    filters[key] = value;
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    throw invalidRequest(`"date_from" must not be after "date_to".`);
  }
  return filters;
}

export function parseRowsQuery(params: URLSearchParams): RowsQuery {
  const page = intParam(params, "page", 1, MAX_OFFSET) ?? 1;
  const pageSize = intParam(params, "pageSize", 1, MAX_PAGE_SIZE) ?? DEFAULT_PAGE_SIZE;
  if ((page - 1) * pageSize > MAX_OFFSET) {
    throw invalidRequest(`Page is out of range. Narrow the results with filters instead of paging deeper.`);
  }

  const sort = (params.get("sort") ?? "invoice_id") as ListColumn;
  if (!(LIST_COLUMNS as readonly string[]).includes(sort)) {
    throw invalidRequest(`"sort" must be one of: ${LIST_COLUMNS.join(", ")}.`);
  }
  const dirRaw = (params.get("dir") ?? "asc").toLowerCase();
  if (dirRaw !== "asc" && dirRaw !== "desc") throw invalidRequest(`"dir" must be "asc" or "desc".`);

  return { filters: parseRowFilters(params), page, pageSize, sort, dir: dirRaw };
}

/** Escape LIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

type Binder = (value: unknown, cast: "text" | "int" | "date") => string;

function buildConditions(filters: RowFilters, bind: Binder): string[] {
  const conditions: string[] = [];

  for (const field of TEXT_FILTER_FIELDS) {
    const value = filters.text[field];
    if (value !== undefined) conditions.push(`${quote(field)} = ${bind(value, "text")}`);
  }
  if (filters.year !== undefined) conditions.push(`year = ${bind(filters.year, "int")}`);
  if (filters.month !== undefined) conditions.push(`month = ${bind(filters.month, "int")}`);
  if (filters.dateFrom) conditions.push(`sale_date >= ${bind(filters.dateFrom, "date")}`);
  if (filters.dateTo) conditions.push(`sale_date <= ${bind(filters.dateTo, "date")}`);

  if (filters.q) {
    const pattern = bind(`%${escapeLike(filters.q)}%`, "text");
    const ors = [...SEARCH_FIELDS.map((f) => `${quote(f)} ILIKE ${pattern}`), `invoice_id::text ILIKE ${pattern}`];
    conditions.push(`(${ors.join(" OR ")})`);
  }
  return conditions;
}

function makeBinder(params: unknown[]): Binder {
  return (value, cast) => {
    params.push(value);
    return `$${params.length}::${cast}`;
  };
}

export function buildRowsStatements(query: RowsQuery): { page: Statement; count: Statement } {
  // Page statement
  const pageParams: unknown[] = [];
  const pageConditions = buildConditions(query.filters, makeBinder(pageParams));
  const where = pageConditions.length ? `WHERE ${pageConditions.join(" AND ")}` : "";
  pageParams.push(query.pageSize, (query.page - 1) * query.pageSize);
  const limit = `$${pageParams.length - 1}::int`;
  const offset = `$${pageParams.length}::int`;
  const direction = query.dir === "desc" ? "DESC" : "ASC";

  const page: Statement = {
    text:
      `SELECT ${LIST_SELECT} FROM walmart ${where} ` +
      `ORDER BY walmart.${quote(query.sort)} ${direction}, walmart.invoice_id ASC ` +
      `LIMIT ${limit} OFFSET ${offset}`,
    params: pageParams,
  };

  // Count statement (same filters, its own parameter numbering)
  const countParams: unknown[] = [];
  const countConditions = buildConditions(query.filters, makeBinder(countParams));
  const count: Statement = {
    text: `SELECT COUNT(*)::int AS total FROM walmart ${
      countConditions.length ? `WHERE ${countConditions.join(" AND ")}` : ""
    }`.trim(),
    params: countParams,
  };

  return { page, count };
}

export type RowsPage = {
  rows: Row[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: ListColumn;
  dir: "asc" | "desc";
};

export function buildRowsPage(rows: Row[], total: number, query: RowsQuery): RowsPage {
  return {
    rows,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    sort: query.sort,
    dir: query.dir,
  };
}

/**
 * One keyset page for the streaming export: rows strictly after `afterId`,
 * ordered by the unique invoice_id. Constant cost per batch regardless of how
 * deep into the table the export is, unlike OFFSET.
 */
export function buildExportBatch(filters: RowFilters, afterId: number, batchSize: number): Statement {
  const params: unknown[] = [];
  const bind = makeBinder(params);
  const conditions = [`invoice_id > ${bind(afterId, "int")}`, ...buildConditions(filters, bind)];
  params.push(batchSize);
  return {
    text:
      `SELECT ${EXPORT_SELECT} FROM walmart WHERE ${conditions.join(" AND ")} ` +
      `ORDER BY invoice_id ASC LIMIT $${params.length}::int`,
    params,
  };
}
