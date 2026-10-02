# Walmart AI Analyst

An AI-powered data analysis chatbot for 9,969 Walmart sales transactions. Ask questions in plain English — get SQL-backed answers, interactive charts, and business insights instantly.

Built with **Next.js 15**, **GPT-4o**, and **Neon PostgreSQL**.

---

## What it does

- **Natural language → SQL** — Type any business question; GPT-4o writes the PostgreSQL query
- **Interactive charts** — Bar, line, pie, scatter, and histogram charts rendered with Recharts
- **Business insights** — Every answer includes a concise insight with real numbers from the data
- **Full data viewer** — Browse all 9,969 rows in a paginated, searchable table
- **CSV export** — Download the full cleaned dataset with one click
- **Chat history** — Multi-turn conversation with context carried across questions

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| AI | OpenAI GPT-4o |
| Database | Neon (serverless PostgreSQL) |
| Charts | Recharts |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Language | TypeScript |

---

## Dataset

**9,969 Walmart sales transactions** across 21 columns:

| Column | Type | Description |
|---|---|---|
| `invoice_id` | INT | Unique transaction ID |
| `branch` | TEXT | Branch code (e.g. WALM003) |
| `city` | TEXT | City name |
| `category` | TEXT | Product category (6 categories) |
| `unit_price` | FLOAT | Price per unit in USD |
| `quantity` | FLOAT | Items purchased (1–10) |
| `date` | TEXT | Format `DD/MM/YY` |
| `time` | TEXT | Format `HH:MM:SS` |
| `payment_method` | TEXT | Ewallet / Cash / Credit card |
| `rating` | FLOAT | Customer rating (3.0–10.0) |
| `profit_margin` | FLOAT | Decimal ratio (0.18–0.57) |
| `total` | FLOAT | `unit_price × quantity` |

---

## Project structure

```
wallmart-ai-data-analysis/
├── app/
│   ├── page.tsx                # Main page — header + chat
│   ├── layout.tsx              # Root layout (dark mode, fonts)
│   ├── globals.css             # Tailwind base styles
│   └── api/
│       ├── chat/route.ts       # POST — GPT-4o chat endpoint
│       ├── data/route.ts       # GET  — fetch all rows as JSON
│       └── export/route.ts     # GET  — stream full dataset as CSV
├── components/
│   ├── chat-interface.tsx      # Main chat UI with message history
│   ├── message-item.tsx        # Individual message bubble
│   ├── chart-panel.tsx         # Recharts chart renderer
│   ├── data-table.tsx          # Inline results table
│   ├── data-viewer.tsx         # Full-screen 9,969-row data viewer
│   └── header-actions.tsx      # View Data + Export CSV buttons
└── .env.local                  # DATABASE_URL + OPENAI_API_KEY
```

---

## Getting started

### 1. Clone and install

```bash
git clone <repo-url>
cd wallmart-ai-data-analysis
npm install
```

### 2. Set up environment variables

Create `.env.local` in the project root:

```env
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
OPENAI_API_KEY=sk-...
```

- **Neon** — Sign up at [neon.tech](https://neon.tech), create a project, copy the connection string
- **OpenAI** — Get your API key from [platform.openai.com](https://platform.openai.com)

### 3. Load data into Neon

The dataset must exist as a `walmart` table in your Neon database. Load it from the cleaned CSV:

```python
import pandas as pd
from sqlalchemy import create_engine
import os

engine = create_engine(os.environ["DATABASE_URL"])
df = pd.read_csv("walmart_cleaned_data.csv")
df.to_sql("walmart", engine, if_exists="replace", index=False)
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Example questions

```
Which product category generates the most revenue?
What are the peak sales hours during the day?
Compare payment method usage across all branches.
Show me the top 10 branches by total profit.
Which city has the highest average customer rating?
What is the sales trend by month?
How does profit margin vary across product categories?
```

---

## API routes

| Route | Method | Description |
|---|---|---|
| `/api/chat` | POST | Send a message, get AI response with SQL + chart + insight |
| `/api/data` | GET | Return all rows as JSON (used by the data viewer) |
| `/api/export` | GET | Stream the full dataset as a downloadable CSV |

---

## License

MIT
