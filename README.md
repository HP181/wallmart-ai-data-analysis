# Walmart AI Analyst

Ask questions about Walmart sales in plain English and get a chart, a data table and a short business summary. Built on Next.js 16, the eve agent framework and a Neon PostgreSQL database holding 9,969 cleaned transactions (2019-2023, 100 branches).

## How it works

```
Browser (chat UI, data grid)
   |  eve channel (proxy.ts: rate limit + body size)  |  /api/data, /api/export, /api/health
   v                                                   v
eve agent (GPT-4o) --analyzeData--> lib/query (structured query compiler)
                                       |
                                       v
                          lib/db: READ ONLY transaction + statement timeout
                                       |
                                       v
                                 Neon PostgreSQL
```

**The model never writes SQL.** It calls the `analyzeData` tool with a structured query: `dimensions` (group by), `metrics` (measures) and `filters`, all chosen from an allowlist in `lib/query/catalog.ts`. `lib/query/compile.ts` turns that into one parameterized SELECT. Every identifier comes from the catalog and every value is a bind parameter, so comments, nested queries, functions and keyword tricks have nothing to attach to. Behind that sit two more layers: every query runs in a `READ ONLY` transaction with `SET LOCAL statement_timeout`, and you can point the app at a SELECT-only database role (below).

**Charts are validated.** `lib/query/chart.ts` checks `chartConfig.xKey` and `yKey` against the columns actually returned and checks that y values are numbers. Unknown keys are returned to the model as an error so it can retry. Data that cannot be drawn as requested (text y values, negative pie slices, a single-point line) is downgraded to a table or bar chart with a note. The browser repeats the same check before drawing.

## Setup

Requirements: Node 20+, Python 3.10+ (data pipeline only), a Neon database, an OpenAI API key.

```bash
npm install
# create .env.local with the variables below
npm run dev
```

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | | Neon connection string |
| `OPENAI_API_KEY` | yes | | Used by the agent model |
| `DATABASE_URL_READONLY` | no | | Connection string for a SELECT-only role. Used for all app queries when set |
| `DB_QUERY_TIMEOUT_MS` | no | `8000` | Per-query statement timeout (ms) |
| `MAX_QUERY_ROWS` | no | `500` | Row cap for one analysis result |
| `EXPORT_BATCH_SIZE` | no | `1000` | Rows per keyset batch in the CSV export |
| `EXPORT_MAX_ROWS` | no | `250000` | Hard cap on one export |
| `TOOL_TIMEOUT_MS` | no | `20000` | Hard ceiling for one `analyzeData` tool call (ms). Belt-and-suspenders above `DB_QUERY_TIMEOUT_MS` |
| `SLOW_QUERY_MS` | no | `3000` | Log a `slow_query` alert when a DB transaction exceeds this duration (ms) |
| `RATE_LIMIT_EXPORT` | no | `5` | Max CSV export requests per IP per minute |
| `RATE_LIMIT_CHAT` | no | `20` | Max chat messages per IP per minute |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn` or `error` |

Configuration is validated explicitly. A missing or invalid value is logged at startup and reported by `/api/health`, and API routes answer with a sanitized `503` instead of crashing.

### Loading the data

The cleaned CSV is in `public/Walmart_cleaned_data.csv`.

```bash
pip install pandas numpy sqlalchemy psycopg2-binary python-dotenv
npm run pipeline:all                       # clean_data.py, then migrate_to_neon.py
```

### Migrating an existing database

If the database was loaded before this version, run once:

```bash
npm run db:migrate
```

This applies `scripts/sql/*.sql` and is safe to repeat. It adds typed `sale_date` (date) and `sale_time` (time) generated columns, a unique index on `invoice_id`, and indexes on the common filter and grouping columns (category, branch, city, year, month, shift, payment method, hour, day of week, revenue tier, date). Until it runs, `/api/health` reports `degraded` and date queries fail with a clear message.

### Optional: read-only database role

`scripts/sql/optional/readonly_role.sql` creates a `walmart_readonly` role with SELECT only, a statement timeout and read-only transactions by default. Run it as the database owner (change the password first), then set `DATABASE_URL_READONLY`. The app warns once at runtime if it is running without one.

## API

| Route | Description |
|---|---|
| `GET /api/data` | One page of rows. Params: `page`, `pageSize` (max 200), `sort`, `dir`, `q`, `category`, `branch`, `city`, `payment_method`, `shift`, `day_of_week`, `month_name`, `revenue_tier`, `year`, `month`, `date_from`, `date_to` |
| `GET /api/export` | Streaming CSV (keyset pagination, constant memory). Accepts the same filters. Rate-limited to `RATE_LIMIT_EXPORT` requests per IP per minute. Cells that look like spreadsheet formulas are neutralized |
| `GET /api/health` | `ok`, `degraded` or `error` with config, database and schema checks. No secrets in the body |

Every response carries an `x-request-id` header (an incoming valid one is reused). Logs are one JSON object per line with the request id, route, status and duration; connection strings and passwords are redacted. Errors returned to clients contain a stable `code` and a safe message only.

## Rate limiting and abuse protection

Rate limits are enforced in-process per Fluid Compute instance (no shared store required). For stricter multi-instance enforcement, back the limiter with a shared store such as Vercel KV or Upstash Redis.

| Surface | Limit | HTTP status |
|---|---|---|
| `POST /eve/v1/session*` (chat messages) | `RATE_LIMIT_CHAT` per IP per minute | 429 |
| Chat request body | 8 KB | 413 |
| `GET /api/export` | `RATE_LIMIT_EXPORT` per IP per minute | 429 |

Query complexity is bounded at the schema layer: max 3 dimensions, 6 metrics, 8 filters per tool call. The `analyzeData` tool enforces a hard `TOOL_TIMEOUT_MS` ceiling (default 20 s) as a belt-and-suspenders guard above the database statement timeout.

## Observability

All log lines are structured JSON. The following fields carry `alert` tags that alerting rules can filter on:

| `alert` value | Meaning | Severity |
|---|---|---|
| `slow_query` | A DB transaction exceeded `SLOW_QUERY_MS` | warn |
| `db_error` | A DB query failed inside an analysis | error |
| `export_volume` | An export streamed more than 50 000 rows | warn |
| `repeated_failures` | The same session failed `analyzeData` 3+ times in a row | warn |

Example filter (Datadog, CloudWatch Logs Insights, `jq`):

```bash
# jq — show all alert lines from stdout
npm run dev 2>&1 | jq 'select(.alert != null)'
```

## Project layout

```
agent/            eve agent, instructions.md (prompt), tools/analyzeData.ts
app/              Next.js routes: chat page, /data grid, /api/*
components/       chat, chart panel, header (status from /api/health)
lib/rate-limit.ts token-bucket rate limiter + IP extraction
lib/query/        catalog (allowlist), spec (zod), compile (SQL), chart (validation)
lib/data/rows.ts  paging, filtering and export batches for the raw table
lib/              config, db, errors, logger, http (request ids), csv, analysis
proxy.ts          Next.js 16 Proxy: chat rate limit + body-size guard
scripts/          Python cleaning and load pipeline, SQL migrations
tests/            shared test helpers (in-process Postgres loaded with the real data)
```

## Testing

```bash
npm test          # unit and integration tests
npm run typecheck
npm run lint
```

Tests run against PGlite, an in-process Postgres, loaded with the real 9,969-row dataset and the real migration file, so SQL is actually executed. Coverage includes the query compiler (including injection attempts), query limits, CSV escaping, chart validation, row paging, config, errors, logging, request ids, the three API routes and the migration. `agent/instructions.test.ts` runs every JSON example in the prompt against the real data so the prompt cannot drift from the catalog.

## Known limits

- The data covers 2019-2023, but 2019 contains only January to March, and November and December are much busier than April to July. Compare rates and averages, not raw totals, across periods.
- The model cannot express joins, medians, window functions or HAVING-style filters. This is the deliberate tradeoff for removing free-form SQL.
- Rate limiting is in-process per instance. A distributed deployment under heavy load should add a shared store for accurate cross-instance limits.
- The chat channel and the API routes are unauthenticated. Add authentication before exposing them publicly.
- Files in `public/` (the CSVs and `public/sql`) are served statically.
- Tests use PGlite, not Neon, so Neon-specific behavior (pooler, HTTP driver) is not covered by them.
