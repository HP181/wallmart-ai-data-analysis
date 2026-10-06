# Walmart AI Analyst - Project Plan

Status: implemented. This document describes the current architecture and what is left to do. It replaces the earlier plan that assumed a FastAPI backend and Next.js 14.

## Goal

Let a non-technical user ask questions about Walmart sales in natural language and get a validated chart, the underlying data and a short insight, without the model ever being able to run arbitrary SQL.

## Architecture

| Layer | Technology | Notes |
|---|---|---|
| Web app | Next.js 16 (App Router), React 19 | Chat page, `/data` grid, route handlers under `app/api` |
| Agent | eve 0.69 with `eve/models/openai` (GPT-4o) | One tool: `analyzeData`. The prompt is `agent/instructions.md` |
| Query layer | zod spec compiled to parameterized SQL | `lib/query`. Allowlisted dimensions, metrics and filters |
| Database | Neon PostgreSQL via `@neondatabase/serverless` | Read-only transactions, statement timeout, optional SELECT-only role |
| UI | Tailwind 4, shadcn-style components, Recharts, TanStack Table v9 | Data grid pages server-side |
| Data pipeline | Python scripts (run locally, once) | `clean_data.py`, `migrate_to_neon.py`, `apply_migrations.py` |
| Tests | Vitest 5 + PGlite | Real dataset, real migration, no network |

There is no separate backend service: the Python code is only the one-off load pipeline.

## Request flows

1. **Chat question.** The model calls `analyzeData` with `{query, chartConfig}`. The query is validated (zod), compiled to one SELECT with bind parameters, run in a READ ONLY transaction with a timeout, and fetched with LIMIT+1 to detect truncation. The chart config is checked against the returned columns and values. The tool returns rows, the displayed SQL, any chart warnings and a `truncated` flag; the model sees at most 100 rows.
2. **Data grid.** `/data` is a static page. The client calls `/api/data` for one page at a time with server-side sort, search and filters, and the export link carries the same filters.
3. **Export.** `/api/export` streams CSV in keyset batches on `invoice_id`, so memory stays flat. It is capped by `EXPORT_MAX_ROWS` and neutralizes formula-like cells.
4. **Health.** `/api/health` drives the header badge (row count, database name, model) so the UI no longer hardcodes them.

## Database

Table `walmart` (9,969 rows, 2019-01-01 to 2023-12-31). Original `date` and `time` text columns are kept for the CSV export. Typed generated columns `sale_date` and `sale_time` are used for sorting, filtering and trends. Indexes cover the common filter and grouping columns. Migrations live in `scripts/sql` and are applied with `npm run db:migrate`.

## Safety model

1. The model chooses IDs from an allowlist; it never writes SQL text.
2. Values are bind parameters with explicit casts; sort and group columns come from the catalog.
3. Every query runs in a READ ONLY transaction with a statement timeout and row cap.
4. Optional database role with SELECT only (`scripts/sql/optional/readonly_role.sql`).
5. Errors are sanitized before they reach the client or the model; logs redact connection strings.

## Observability

Structured JSON logs, an `x-request-id` on every API response, startup configuration logging and `onRequestError` in `instrumentation.ts`, and `/api/health`.

## Done

- [x] Structured query compiler replacing string-based SQL validation
- [x] Pagination, server-side filtering, streaming export, indexes
- [x] Chart config validation (server and client)
- [x] Typed date and time columns
- [x] Explicit config validation, sanitized errors, health endpoint
- [x] UI cleanup, header status from the backend
- [x] Unit and integration tests, structured logging, request ids
- [x] Documentation brought in line with the code
- [x] Dependency cleanup (removed `openai`, `@ai-sdk/openai`, `@ai-sdk/react`, `ag-grid-*`)

## Next

- Authentication for the chat channel and API routes (currently open).
- Run the migration and the test flow against the real Neon database in CI (tests currently use PGlite).
- Rate limiting on `/api/export` and the chat channel.
- Move the CSVs and `public/sql` out of `public/` if the data should not be downloadable.
- Support medians, percentiles and HAVING-style filters in the query spec if users need them.
