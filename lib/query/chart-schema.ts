import { z } from "zod";
import { CHART_TYPES } from "@/lib/query/chart";

/** Server-side schema for the chartConfig the model sends alongside a query. */
export const chartConfigSchema = z.object({
  type: z
    .enum(CHART_TYPES)
    .describe("bar: compare categories. line: trends over ordered time. pie: share of a whole (8 or fewer). scatter: two numeric columns. histogram: distribution. table: no clear axes"),
  xKey: z
    .string()
    .max(64)
    .optional()
    .describe("Result column for the x-axis or category names. Required unless type is 'table'"),
  yKey: z
    .string()
    .max(64)
    .optional()
    .describe("Numeric result column for the y-axis or values. Required unless type is 'table'"),
  title: z.string().max(120).describe("Short chart title"),
});
