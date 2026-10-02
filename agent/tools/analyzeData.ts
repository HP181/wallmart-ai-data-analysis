import { defineTool } from "eve/tools";
import { z } from "zod";
import { executeQuery } from "@/lib/db";

export default defineTool({
  description:
    "Execute a PostgreSQL SELECT query on the Walmart database. Call this for every data question. If the query returns an error, fix the SQL and call again (up to 3 retries).",
  inputSchema: z.object({
    sql: z.string().describe("Valid PostgreSQL SELECT query on the walmart table"),
    chartConfig: z.object({
      type: z.enum(["bar", "line", "pie", "scatter", "histogram", "table"]),
      xKey: z.string().describe("Column alias from SELECT for x-axis / category names"),
      yKey: z.string().describe("Column alias from SELECT for y-axis / values"),
      title: z.string(),
    }),
  }),
  async execute({ sql, chartConfig }) {
    const res = await executeQuery(sql);
    if (res.error) {
      return {
        success: false as const,
        error: res.error,
        sql,
        chartConfig,
        rows: [] as Record<string, unknown>[],
        columns: [] as string[],
        rowCount: 0,
      };
    }
    return {
      success: true as const,
      sql,
      chartConfig,
      rows: res.rows,
      columns: res.columns,
      rowCount: res.rowCount,
    };
  },
});
