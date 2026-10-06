import { runReadQueries } from "@/lib/db";
import { buildRowsPage, buildRowsStatements, parseRowsQuery } from "@/lib/data/rows";
import { jsonResponse, withRoute } from "@/lib/http";

/**
 * GET /api/data
 *
 * One page of transactions with server-side sorting, search and filtering.
 *   page (1-based), pageSize (max 200), sort, dir=asc|desc, q (free text),
 *   category, branch, city, payment_method, shift, day_of_week, month_name,
 *   revenue_tier, year, month, date_from, date_to (YYYY-MM-DD)
 *
 * Never returns more than one page, so memory use is bounded no matter how
 * large the table grows.
 */
export const GET = withRoute("data.list", async (request, { log }) => {
  const query = parseRowsQuery(new URL(request.url).searchParams);
  const { page, count } = buildRowsStatements(query);

  // One round trip, one snapshot: the page and its total come from the same transaction.
  const [rows, countRows] = await runReadQueries([page, count], { signal: request.signal });
  const total = Number(countRows?.[0]?.total ?? 0);

  log.debug("data page served", { page: query.page, pageSize: query.pageSize, total });
  return jsonResponse(buildRowsPage(rows ?? [], total, query));
});
