/**
 * The analyst's allowlist: every column, grouping and measure the model may
 * ask for. The SQL fragments below are written by us, reviewed by us, and
 * never contain user or model input. The model only ever picks IDs from here.
 *
 * Pure data, no imports: safe to use from server and client code.
 */

export type ValueKind = "text" | "int" | "float" | "date";

export type DimensionDef = {
  label: string;
  description: string;
  kind: ValueKind;
  /** Expression selected (and grouped by) when used as a dimension. */
  select: string;
  /**
   * Expression used when filtering on this field. Defaults to `select`, so a
   * filter on a bucketed dimension means "in that bucket" (band 8 is 8.0-8.99),
   * not "equal to the raw value". Only override when `select` is a display
   * format that cannot be compared directly (dates).
   */
  filter?: string;
  /**
   * Whether the values have an intrinsic order (time, buckets). Ordered
   * dimensions sort ascending by default; others rank by the first metric.
   */
  ordered: boolean;
  /**
   * Aggregate expression that gives the intrinsic order when the selected
   * value is text that does not sort correctly (e.g. weekday names).
   */
  orderBy?: string;
};

export const DIMENSIONS = {
  branch: {
    label: "Branch",
    description: "Store code, e.g. 'WALM003' (100 branches)",
    kind: "text",
    select: "branch",
    ordered: false,
  },
  city: {
    label: "City",
    description: "City name, e.g. 'San Antonio' (98 cities)",
    kind: "text",
    select: "city",
    ordered: false,
  },
  category: {
    label: "Category",
    description: "Product category (6 values)",
    kind: "text",
    select: "category",
    ordered: false,
  },
  payment_method: {
    label: "Payment method",
    description: "'Ewallet', 'Cash' or 'Credit card'",
    kind: "text",
    select: "payment_method",
    ordered: false,
  },
  revenue_tier: {
    label: "Revenue tier",
    description: "Transaction size: 'Low' (< $50), 'Medium' ($50-$200), 'High' (> $200)",
    kind: "text",
    select: "revenue_tier",
    ordered: true,
    orderBy: "MIN(total)",
  },
  shift: {
    label: "Shift",
    description: "'Morning' (before noon), 'Afternoon' (12:00-17:59), 'Evening' (18:00 on)",
    kind: "text",
    select: "shift",
    ordered: true,
    orderBy: "MIN(hour)",
  },
  hour: {
    label: "Hour of day",
    description: "Hour of the transaction, 6-23",
    kind: "int",
    select: "hour",
    ordered: true,
  },
  day_of_week: {
    label: "Day of week",
    description: "'Monday' to 'Sunday', aggregated across ALL years",
    kind: "text",
    select: "day_of_week",
    ordered: true,
    orderBy: "MIN(EXTRACT(ISODOW FROM sale_date))",
  },
  sale_date: {
    label: "Date",
    description: "Calendar day, 'YYYY-MM-DD' (daily trends; up to ~1,800 days)",
    kind: "date",
    select: "to_char(sale_date, 'YYYY-MM-DD')",
    filter: "sale_date",
    ordered: true,
  },
  year_month: {
    label: "Year-month",
    description: "Calendar month, 'YYYY-MM'. Use this for month-by-month trends over time",
    kind: "text",
    select: "to_char(sale_date, 'YYYY-MM')",
    ordered: true,
  },
  year: {
    label: "Year",
    description: "Calendar year, 2019-2023",
    kind: "int",
    select: "year",
    ordered: true,
  },
  month: {
    label: "Month number",
    description: "Month 1-12 pooled across ALL years (seasonality, not a time series)",
    kind: "int",
    select: "month",
    ordered: true,
  },
  month_name: {
    label: "Month name",
    description: "'January' to 'December' pooled across ALL years (seasonality)",
    kind: "text",
    select: "month_name",
    ordered: true,
    orderBy: "MIN(month)",
  },
  week_number: {
    label: "ISO week",
    description: "ISO week number 1-53 pooled across ALL years",
    kind: "int",
    select: "week_number",
    ordered: true,
  },
  quantity: {
    label: "Quantity",
    description: "Items in the transaction, 1-10",
    kind: "int",
    select: "quantity",
    ordered: true,
  },
  rating_band: {
    label: "Rating band",
    description: "Customer rating rounded down to an integer, 3-10 (use for rating histograms)",
    kind: "int",
    select: "FLOOR(rating)::int",
    ordered: true,
  },
  unit_price_band: {
    label: "Unit price band",
    description: "Unit price bucket of $10, shown as the lower bound (use for price histograms)",
    kind: "int",
    select: "(FLOOR(unit_price / 10) * 10)::int",
    ordered: true,
  },
  total_band: {
    label: "Order total band",
    description: "Transaction total bucket of $50, shown as the lower bound (use for order-size histograms)",
    kind: "int",
    select: "(FLOOR(total / 50) * 50)::int",
    ordered: true,
  },
} as const satisfies Record<string, DimensionDef>;

export type DimensionId = keyof typeof DIMENSIONS;

export type MetricDef = {
  label: string;
  description: string;
  kind: "int" | "float";
  expr: string;
};

export const METRICS = {
  revenue: {
    label: "Revenue",
    description: "Total sales in USD (SUM of total)",
    kind: "float",
    expr: "ROUND(SUM(total)::numeric, 2)::float8",
  },
  profit: {
    label: "Profit",
    description: "Total profit in USD (SUM of profit_amount)",
    kind: "float",
    expr: "ROUND(SUM(profit_amount)::numeric, 2)::float8",
  },
  transactions: {
    label: "Transactions",
    description: "Number of transactions",
    kind: "int",
    expr: "COUNT(*)::int",
  },
  units_sold: {
    label: "Units sold",
    description: "Total items sold (SUM of quantity)",
    kind: "int",
    expr: "COALESCE(SUM(quantity), 0)::int",
  },
  avg_order_value: {
    label: "Average order value",
    description: "Mean transaction total in USD",
    kind: "float",
    expr: "ROUND(AVG(total)::numeric, 2)::float8",
  },
  avg_rating: {
    label: "Average rating",
    description: "Mean customer rating, 3-10",
    kind: "float",
    expr: "ROUND(AVG(rating)::numeric, 2)::float8",
  },
  avg_unit_price: {
    label: "Average unit price",
    description: "Mean price per unit in USD",
    kind: "float",
    expr: "ROUND(AVG(unit_price)::numeric, 2)::float8",
  },
  profit_margin_pct: {
    label: "Profit margin %",
    description: "Effective margin: SUM(profit) / SUM(revenue) x 100. Prefer this for 'profit margin' questions",
    kind: "float",
    expr: "ROUND((100.0 * SUM(profit_amount) / NULLIF(SUM(total), 0))::numeric, 2)::float8",
  },
  avg_profit_margin: {
    label: "Average margin ratio",
    description: "Simple mean of each transaction's margin ratio (0.18-0.57, not a percent)",
    kind: "float",
    expr: "ROUND(AVG(profit_margin)::numeric, 4)::float8",
  },
  branches: {
    label: "Branches",
    description: "Number of distinct branches",
    kind: "int",
    expr: "COUNT(DISTINCT branch)::int",
  },
} as const satisfies Record<string, MetricDef>;

export type MetricId = keyof typeof METRICS;

/** Numeric columns that may be filtered on but are not offered as groupings. */
export const FILTER_ONLY_FIELDS = {
  unit_price: { label: "Unit price", kind: "float", filter: "unit_price" },
  total: { label: "Order total", kind: "float", filter: "total" },
  rating: { label: "Rating", kind: "float", filter: "rating" },
  profit_margin: { label: "Margin ratio", kind: "float", filter: "profit_margin" },
  profit_amount: { label: "Profit amount", kind: "float", filter: "profit_amount" },
} as const satisfies Record<string, { label: string; kind: ValueKind; filter: string }>;

export type FilterFieldId = DimensionId | keyof typeof FILTER_ONLY_FIELDS;

export const DIMENSION_IDS = Object.keys(DIMENSIONS) as [DimensionId, ...DimensionId[]];
export const METRIC_IDS = Object.keys(METRICS) as [MetricId, ...MetricId[]];
export const FILTER_FIELD_IDS = [
  ...DIMENSION_IDS,
  ...(Object.keys(FILTER_ONLY_FIELDS) as (keyof typeof FILTER_ONLY_FIELDS)[]),
] as [FilterFieldId, ...FilterFieldId[]];

export function filterFieldInfo(id: FilterFieldId): { kind: ValueKind; expr: string } {
  if (id in DIMENSIONS) {
    const d = DIMENSIONS[id as DimensionId] as DimensionDef;
    return { kind: d.kind, expr: d.filter ?? d.select };
  }
  const f = FILTER_ONLY_FIELDS[id as keyof typeof FILTER_ONLY_FIELDS];
  return { kind: f.kind, expr: f.filter };
}
