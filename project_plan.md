# Walmart AI Data Analyst — Project Plan

---

## Overview

An AI-powered Walmart sales analyst with a professional chat interface, streaming responses, and truly interactive dashboards. Users ask natural language questions, the AI generates SQL, runs it on the database, and renders live Python-built charts with filters and selects.

**Hosted entirely on Vercel.**

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Chat UI, dashboard, interactive charts |
| AI Agent | Vercel Eve | Orchestrates SQL generation, querying, insights |
| Backend | FastAPI (Python) | Data analysis endpoints, SQL execution on Neon |
| Database | Neon (PostgreSQL) | Cloud database hosting cleaned Walmart data |
| Streaming | Vercel AI SDK (`useChat`) | Real-time streaming chat responses |
| Charts | Recharts + shadcn/ui | Interactive charts with filters, selects, drilldowns |
| Styling | Tailwind CSS + shadcn/ui | Professional UI components |
| Data Pipeline | Python (local, one-time) | Clean CSV → load to Neon |
| Deployment | Vercel | Hosts Next.js + FastAPI together |

---

## Architecture

```
User
  │
  ▼
Next.js Frontend (Vercel)
├── Chat Interface (streaming via Vercel AI SDK)
├── Interactive Dashboard (Recharts + filters)
└── API calls
      │
      ├──► Next.js API Route /api/chat
      │         │
      │         ▼
      │    Vercel Eve Agent
      │    ├── instructions/walmart-analyst.md
      │    ├── tools/queryDatabase.ts  ──► Neon PostgreSQL
      │    ├── tools/generateChartConfig.ts
      │    └── tools/getSchema.ts
      │
      └──► FastAPI (Python, Vercel Serverless)
               ├── /api/py/query     → Execute SQL, return DataFrame
               ├── /api/py/analyze   → Pandas analysis on demand
               └── /api/py/migrate   → One-time data migration endpoint
```

---

## How It Works (User Flow)

```
1. User types: "Which category has highest profit this year?"
        ↓
2. Vercel Eve Agent receives question + DB schema context
        ↓
3. Eve calls tool: getSchema() → gets walmart table columns
        ↓
4. Eve calls OpenAI → generates PostgreSQL query + chart config + insight
        ↓
5. Eve calls tool: queryDatabase(sql) → FastAPI → Neon → returns rows
        ↓
6. Next.js streams response back to user (text + chart config + data)
        ↓
7. Frontend renders:
   ├── Streaming insight text (typewriter effect)
   ├── Interactive Recharts bar/line/pie chart
   ├── Filter dropdowns (category, branch, date range)
   └── Raw data table (collapsible)
```

---

## Project Structure

```
walmart-ai-analyst/                  ← New Next.js project
│
├── app/                             ← Next.js App Router
│   ├── page.tsx                     ← Main page (chat + dashboard)
│   ├── layout.tsx                   ← Root layout
│   └── api/
│       ├── chat/route.ts            ← Streaming chat (Vercel AI SDK + Eve)
│       └── schema/route.ts          ← Fetch DB column names for AI context
│
├── components/
│   ├── ChatInterface.tsx            ← Chat UI with streaming
│   ├── ChartPanel.tsx               ← Dynamic chart renderer
│   ├── FilterSidebar.tsx            ← Category, branch, date filters
│   ├── DataTable.tsx                ← Collapsible results table
│   └── ui/                         ← shadcn/ui components
│
├── agent/                           ← Vercel Eve agent
│   ├── agent.ts                     ← Agent config (model, channels)
│   ├── instructions/
│   │   └── walmart-analyst.md       ← Agent behavior + SQL rules
│   └── tools/
│       ├── queryDatabase.ts         ← Calls FastAPI → Neon
│       ├── getSchema.ts             ← Returns DB schema to AI
│       └── generateChartConfig.ts   ← Picks chart type + columns
│
├── lib/
│   ├── neon.ts                      ← Neon DB client (@neondatabase/serverless)
│   └── types.ts                     ← Shared TypeScript types
│
├── api/                             ← FastAPI Python backend
│   ├── main.py                      ← FastAPI app entry point
│   ├── routes/
│   │   ├── query.py                 ← SQL execution, returns JSON
│   │   └── analyze.py              ← Pandas analysis (describe, groupby etc.)
│   ├── db.py                        ← SQLAlchemy + Neon connection
│   └── requirements.txt             ← Python deps for FastAPI
│
├── data_pipeline/                   ← Local Python scripts (run once)
│   ├── clean_data.py                ← Improved cleaning + feature engineering
│   └── migrate_to_neon.py          ← Load cleaned data to Neon
│
├── vercel.json                      ← Routes Next.js + FastAPI on Vercel
├── .env.local                       ← NEON_DATABASE_URL, OPENAI_API_KEY
└── package.json
```

---

## Part 1 — Improved Python Data Pipeline (Run Once, Local)

The existing notebook will be improved and split into two clean scripts:

### `clean_data.py` — Better Cleaning & Feature Engineering

**Improvements over current notebook:**
- Parse `date` column properly → add `year`, `month`, `day_of_week`, `week_number`
- Parse `time` column → add `hour`, `shift` (Morning/Afternoon/Evening)
- Calculate `profit_amount` = `unit_price * quantity * profit_margin` (dollars, not ratio)
- Calculate `revenue_category` (High/Medium/Low based on total)
- Standardize `branch` to a cleaner format
- Validate data ranges (rating 3–10, profit_margin 0.18–0.57)
- Full EDA summary printed to console (nulls, duplicates, dtypes, describe)

**Final cleaned columns (16 total, up from 12):**
```
invoice_id, branch, city, category, unit_price, quantity,
date, time, payment_method, rating, profit_margin, total,
profit_amount, year, month, day_of_week, hour, shift
```

### `migrate_to_neon.py` — Load to Neon PostgreSQL
- Reads cleaned CSV
- Connects to Neon via `DATABASE_URL` from `.env`
- Creates table with proper PostgreSQL types
- Loads 9,969 rows via `df.to_sql()`
- Prints row count confirmation

---

## Part 2 — Vercel Eve Agent

Eve handles the AI agent orchestration — replacing a manual OpenAI API call with a structured, durable agent.

### `agent/instructions/walmart-analyst.md`
Defines agent behavior:
- Role: Expert Walmart sales data analyst
- Database schema (all 16 columns with descriptions)
- PostgreSQL SQL rules (use `TO_DATE`, `EXTRACT(HOUR FROM time::time)`, etc.)
- Chart type selection guide
- Insight writing style (2–4 sentences, include numbers)

### `agent/tools/queryDatabase.ts`
```typescript
// Calls FastAPI /api/py/query with generated SQL
// Returns { rows: [], columns: [], rowCount: number }
// Validates SQL is SELECT-only before sending
```

### `agent/tools/generateChartConfig.ts`
```typescript
// Returns structured chart config:
// { type: "bar"|"line"|"pie"|"scatter"|"histogram",
//   xKey, yKey, title, colorKey }
```

### `agent/tools/getSchema.ts`
```typescript
// Returns full schema description from Neon information_schema
// Injected into every agent context
```

---

## Part 3 — FastAPI Backend (Python, Vercel Serverless)

### Why FastAPI alongside Next.js?
- Pandas analysis on demand (`.describe()`, correlation, groupby summaries)
- More complex data processing than raw SQL
- Python ML/stats libraries if needed later (scipy, scikit-learn)
- Keeps Python data logic separate from TypeScript

### Key Endpoints
```
POST /api/py/query
  Body: { sql: string }
  Returns: { rows: [], columns: [], rowCount: number, executionTime: ms }

POST /api/py/analyze
  Body: { analysisType: "describe"|"correlation"|"groupby", params: {} }
  Returns: { result: {} }

GET  /api/py/health
  Returns: { status: "ok", dbConnected: boolean }
```

### Vercel Python Deployment (`vercel.json`)
```json
{
  "rewrites": [
    { "source": "/api/py/(.*)", "destination": "/api/main.py" }
  ]
}
```

---

## Part 4 — Next.js Frontend

### Chat Interface
- Built with Vercel AI SDK `useChat` hook
- Streaming response (typewriter effect)
- Each assistant message renders:
  1. Insight text (streaming)
  2. Interactive Recharts chart (after stream completes)
  3. Filter controls (category, branch, date range, payment method)
  4. Collapsible raw data table
  5. Collapsible generated SQL (syntax highlighted)

### Interactive Charts (Recharts)
All charts are rendered in React with real interactivity:
- `BarChart` — category/branch comparisons
- `LineChart` — time series, trends by month
- `PieChart` — payment method share, category split
- `ScatterChart` — correlation (rating vs total, etc.)
- `AreaChart` — cumulative revenue over time

**Chart Features:**
- Hover tooltips with formatted values
- Legend click to show/hide series
- Zoom and brush on time series
- Animated on load
- Responsive (mobile friendly)

### Filter Sidebar
Persistent filters that update charts in real time (no page reload):
- Category multiselect
- Branch multiselect
- City multiselect
- Payment method multiselect
- Date range picker (Jan 2019 – Mar 2019 — data range)
- Rating range slider (3.0 – 10.0)

### UI Design
- Dark/light mode toggle
- shadcn/ui components throughout
- Tailwind CSS
- Chat on left, chart panel on right (two-column layout on desktop)
- Mobile: stacked layout

---

## Part 5 — Deployment on Vercel

Both Next.js and FastAPI deploy from the same repository on Vercel:

```
vercel.json routes:
/api/py/*  →  FastAPI (Python serverless functions)
/*         →  Next.js
```

### Environment Variables (Vercel Dashboard)
```
NEON_DATABASE_URL=postgresql://...@neon.tech/neondb?sslmode=require
OPENAI_API_KEY=sk-...
```

### Vercel Free Tier Limits to Note
- Serverless function timeout: 10 seconds (sufficient for SQL queries)
- Python runtime: Available on all plans
- Neon free tier: 0.5 GB storage, 1 compute unit (sufficient for 9,969 rows)

---

## Implementation Order

### Phase 1 — Data Pipeline (Local Python)
- [ ] Improve `clean_data.py` — better cleaning + 4 new feature columns
- [ ] Write `migrate_to_neon.py` — load to Neon PostgreSQL
- [ ] Verify data in Neon dashboard

### Phase 2 — FastAPI Backend
- [ ] Setup FastAPI project in `/api/`
- [ ] DB connection to Neon
- [ ] `/api/py/query` endpoint with SQL safety validation
- [ ] `/api/py/analyze` endpoint
- [ ] Test locally with uvicorn

### Phase 3 — Vercel Eve Agent
- [ ] Setup Eve project structure
- [ ] Write `walmart-analyst.md` instructions (schema + SQL rules)
- [ ] Implement 3 tools (queryDatabase, getSchema, generateChartConfig)
- [ ] Test agent with sample questions

### Phase 4 — Next.js Frontend
- [ ] Create Next.js project with App Router + Tailwind + shadcn/ui
- [ ] Build `ChatInterface.tsx` with Vercel AI SDK streaming
- [ ] Build `ChartPanel.tsx` with all Recharts chart types
- [ ] Build `FilterSidebar.tsx` with real-time filter state
- [ ] Build `DataTable.tsx` collapsible component
- [ ] Wire `/api/chat/route.ts` to Eve agent

### Phase 5 — Integration & Deployment
- [ ] Connect all parts end-to-end locally
- [ ] Write `vercel.json` routing config
- [ ] Deploy to Vercel
- [ ] Set environment variables in Vercel dashboard
- [ ] End-to-end test on production URL

---

## Smart Query Retry Logic

When a generated SQL query fails, the agent does **not** retry blindly. It feeds the error back to the AI so it can understand and fix the mistake — up to **3 attempts** before giving up gracefully.

### Retry Flow

```
Attempt 1: AI generates SQL → Execute → ❌ Fail
              ↓
    Feed back to AI:
    "Attempt 1 failed.
     SQL: SELECT day_name, COUNT(*) FROM walmart ...
     Error: column 'day_name' does not exist
     Fix the SQL and try again."
              ↓
Attempt 2: AI generates corrected SQL → Execute → ❌ Fail
              ↓
    Feed back to AI again with both previous attempts + errors
              ↓
Attempt 3: AI generates corrected SQL → Execute → ✅ or ❌
              ↓
    If still failing:
    "I tried 3 times but couldn't generate a working query.
     The last error was: [error]. Try rephrasing your question."
```

### What the AI Learns Between Retries

Each retry prompt includes:
- The original user question
- All previous SQL attempts
- All PostgreSQL error messages received
- Reminder of correct PostgreSQL syntax rules

This handles the most common Text-to-SQL errors automatically:
| Error | AI Fix on Retry |
|---|---|
| Column alias not in GROUP BY | Adds correct GROUP BY |
| Wrong date function (MySQL syntax) | Switches to `TO_DATE()` / `EXTRACT()` |
| Column doesn't exist | Uses correct column name from schema |
| Aggregation error | Fixes SELECT + GROUP BY alignment |
| Division by zero | Adds `NULLIF()` guard |

### Implementation in Vercel Eve

In the Eve agent's `queryDatabase.ts` tool:
```typescript
// Pseudo-code
async function queryWithRetry(question, sql, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await executeSQL(sql)
    if (result.success) return result

    if (attempt < maxAttempts) {
      // Feed error back to AI for a smarter retry
      sql = await askAIToFixSQL({
        question,
        failedSQL: sql,
        error: result.error,
        attemptNumber: attempt
      })
    } else {
      // All retries exhausted — return friendly error
      return {
        success: false,
        userMessage: `I tried ${maxAttempts} times but couldn't answer this. Last error: ${result.error}. Try rephrasing.`
      }
    }
  }
}
```

### What the User Sees During Retries

- A subtle status indicator: `"Refining query... (attempt 2/3)"`
- No error shown unless all 3 attempts fail
- If all fail: a friendly message with the error reason and a suggestion to rephrase

---

## Sample Questions the App Will Answer

1. "Which product category generates the highest revenue?"
2. "What are the peak sales hours across all branches?"
3. "Compare profit margins by city"
4. "Show payment method trends over time"
5. "Which branch has the highest customer ratings?"
6. "What is the revenue breakdown for evenings vs mornings?"
7. "Show me the top 5 cities by total sales volume"
8. "Is there a correlation between rating and profit margin?"

---

## What's Reused from Existing Project

| Existing Asset | Reused How |
|---|---|
| `Walmart_raw_data.csv` | Input to improved `clean_data.py` |
| `walmart project.ipynb` | Reference for cleaning logic (improved in new script) |
| `walmart query.sql` | Reference for SQL patterns (translated to PostgreSQL in Eve instructions) |
| MySQL credentials | Not reused — replaced by Neon |

---

## Key Decisions Summary

| Decision | Choice | Reason |
|---|---|---|
| Database | Neon PostgreSQL | Free, serverless, Vercel-native |
| AI Agent | Vercel Eve | Built for Vercel, durable, structured tools |
| Charts | Recharts | React-native, interactive, no iframe |
| Filters | React state (Zustand) | Instant updates, no page reload |
| Streaming | Vercel AI SDK | Built for Next.js, handles streaming natively |
| Python hosting | Vercel serverless functions | Same repo, no separate server |
