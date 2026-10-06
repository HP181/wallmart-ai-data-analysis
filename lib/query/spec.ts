import { z } from "zod";
import { invalidQuery } from "@/lib/errors";
import {
  DIMENSION_IDS,
  FILTER_FIELD_IDS,
  METRIC_IDS,
  filterFieldInfo,
  type FilterFieldId,
  type ValueKind,
} from "@/lib/query/catalog";

/**
 * The only thing the model may send to the database layer: a small, typed
 * description of a query. There is no free-form SQL anywhere in this shape.
 */

export const FILTER_OPS = ["eq", "neq", "in", "gte", "lte", "between"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

const MAX_FILTER_VALUES = 20;
const MAX_STRING_VALUE = 64;

export const filterSchema = z.object({
  field: z.enum(FILTER_FIELD_IDS).describe("Column to filter on"),
  op: z
    .enum(FILTER_OPS)
    .describe("eq / neq: one value. in: 1-20 values. gte / lte: one value. between: exactly two values (inclusive)"),
  values: z
    .array(z.union([z.string().max(MAX_STRING_VALUE), z.number().finite()]))
    .min(1)
    .max(MAX_FILTER_VALUES)
    .describe("Text values are case-sensitive. Dates are 'YYYY-MM-DD'"),
});

export const querySpecSchema = z.object({
  dimensions: z
    .array(z.enum(DIMENSION_IDS))
    .max(3)
    .default([])
    .describe("Columns to group by. Leave empty for a single overall total row"),
  metrics: z
    .array(z.enum(METRIC_IDS))
    .min(1)
    .max(6)
    .describe("Measures to compute. Include only what the question needs"),
  filters: z.array(filterSchema).max(8).default([]).describe("Conditions, combined with AND"),
  orderBy: z
    .object({
      field: z.enum([...DIMENSION_IDS, ...METRIC_IDS] as [string, ...string[]]),
      direction: z.enum(["asc", "desc"]).default("desc"),
    })
    .optional()
    .describe("Must be one of the selected dimensions or metrics. Omit for sensible defaults"),
  limit: z.number().int().min(1).max(5000).optional().describe("Max rows. Omit for the default"),
});

export type QuerySpec = z.infer<typeof querySpecSchema>;
export type FilterSpec = z.infer<typeof filterSchema>;

/** A filter value after coercion to its column's type. */
export type TypedValue = { kind: ValueKind; value: string | number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Coerce one raw value to the column's type or throw a message the model can act on. */
export function coerceValue(field: FilterFieldId, raw: string | number): TypedValue {
  const { kind } = filterFieldInfo(field);
  const fail = (expected: string) =>
    invalidQuery(`Filter on "${field}" needs ${expected}, got ${JSON.stringify(raw)}.`);

  switch (kind) {
    case "text":
      if (typeof raw !== "string") throw fail("a text value");
      return { kind, value: raw };
    case "int": {
      const n = typeof raw === "number" ? raw : /^-?\d+$/.test(raw.trim()) ? Number(raw) : NaN;
      if (!Number.isInteger(n)) throw fail("a whole number");
      return { kind, value: n };
    }
    case "float": {
      const n = typeof raw === "number" ? raw : raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) throw fail("a number");
      return { kind, value: n };
    }
    case "date":
      if (typeof raw !== "string" || !isRealDate(raw)) throw fail("a date formatted 'YYYY-MM-DD'");
      return { kind, value: raw };
  }
}

/** Enforce per-operator value counts. */
export function checkFilterArity(filter: FilterSpec): void {
  const n = filter.values.length;
  const bad = (rule: string) =>
    invalidQuery(`Filter on "${filter.field}" with op "${filter.op}" ${rule}, got ${n}.`);
  switch (filter.op) {
    case "eq":
    case "neq":
    case "gte":
    case "lte":
      if (n !== 1) throw bad("needs exactly 1 value");
      break;
    case "between":
      if (n !== 2) throw bad("needs exactly 2 values");
      break;
    case "in":
      break; // 1..MAX_FILTER_VALUES already enforced by the schema
  }
}

/** Parse untrusted input into a QuerySpec, converting schema errors into model-readable ones. */
export function parseQuerySpec(input: unknown): QuerySpec {
  const parsed = querySpecSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "query"}: ${i.message}`)
      .join("; ");
    throw invalidQuery(`Invalid query. ${detail}`);
  }
  return parsed.data;
}
