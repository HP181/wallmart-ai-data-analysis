"""
Walmart Data Pipeline — Step 2: Migrate Cleaned Data → Neon PostgreSQL
Location: wallmart-ai-data-analysis/scripts/migrate_to_neon.py

Run from the project root:
    npm run pipeline:migrate
  or directly:
    python scripts/migrate_to_neon.py

Reads DATABASE_URL from .env.local in the project root.

Requirements (install once):
    pip install pandas sqlalchemy psycopg2-binary python-dotenv
"""

import os
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy import Integer, Text, Float, SmallInteger
from dotenv import load_dotenv

from apply_migrations import apply_sql_migrations  # scripts/apply_migrations.py

# ─── Paths ────────────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CLEAN_PATH   = os.path.join(PROJECT_ROOT, "public", "Walmart_cleaned_data.csv")
ENV_PATH     = os.path.join(PROJECT_ROOT, ".env.local")   # Next.js env file

TABLE_NAME   = "walmart"

# ─── Load .env.local ──────────────────────────────────────────────────────────
load_dotenv(ENV_PATH)
# Use unpooled connection for migrations (pgBouncer pooler can cause issues with DDL)
DATABASE_URL = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")

# ─── Explicit PostgreSQL column types ─────────────────────────────────────────
COLUMN_TYPES = {
    "invoice_id"     : Integer(),
    "branch"         : Text(),
    "city"           : Text(),
    "category"       : Text(),
    "unit_price"     : Float(),
    "quantity"       : SmallInteger(),
    "date"           : Text(),
    "time"           : Text(),
    "payment_method" : Text(),
    "rating"         : Float(),
    "profit_margin"  : Float(),
    "total"          : Float(),
    "profit_amount"  : Float(),
    "year"           : SmallInteger(),
    "month"          : SmallInteger(),
    "month_name"     : Text(),
    "day_of_week"    : Text(),
    "week_number"    : SmallInteger(),
    "hour"           : SmallInteger(),
    "shift"          : Text(),
    "revenue_tier"   : Text(),
}


def check_env() -> None:
    if not DATABASE_URL:
        print("❌ DATABASE_URL not set.")
        print(f"   Add it to {ENV_PATH}:")
        print("   DATABASE_URL=postgresql://user:pass@host/db?sslmode=require")
        raise SystemExit(1)
    host = DATABASE_URL.split("@")[-1].split("/")[0]
    print(f"✅ DATABASE_URL found  (host: {host})")


def load_csv(path: str) -> pd.DataFrame:
    if not os.path.exists(path):
        print(f"❌ Cleaned CSV not found: {path}")
        print("   Run  npm run pipeline:clean  first.")
        raise SystemExit(1)
    df = pd.read_csv(path)
    print(f"✅ Loaded cleaned CSV  : {df.shape[0]:,} rows × {df.shape[1]} columns")
    return df


def migrate(df: pd.DataFrame, engine) -> None:
    print(f"\n📤 Migrating → Neon table '{TABLE_NAME}'...")

    # Keep only columns we have explicit types for
    cols = [c for c in df.columns if c in COLUMN_TYPES]
    df   = df[cols]

    df.to_sql(
        name      = TABLE_NAME,
        con       = engine,
        if_exists = "replace",   # drops + recreates — safe for one-time migration
        index     = False,
        dtype     = COLUMN_TYPES,
        method    = "multi",     # batch inserts (much faster)
        chunksize = 500,
    )
    print(f"   ✅ {len(df):,} rows inserted")


def apply_migrations(engine) -> None:
    """Typed date/time columns and indexes live in scripts/sql/*.sql (single source of truth)."""
    print("\n📌 Applying SQL migrations (typed date/time columns, indexes)...")
    apply_sql_migrations(engine)


def verify(engine) -> None:
    print("\n🔍 Verifying migration...")
    with engine.connect() as conn:
        count  = conn.execute(text(f"SELECT COUNT(*) FROM {TABLE_NAME}")).scalar()
        cols   = conn.execute(text(f"""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = '{TABLE_NAME}'
            ORDER BY ordinal_position
        """)).fetchall()
        sample = conn.execute(text(
            f"SELECT invoice_id, branch, category, total, shift, sale_date, sale_time "
            f"FROM {TABLE_NAME} ORDER BY invoice_id LIMIT 3"
        )).fetchall()

    print(f"   Row count : {count:,}")
    print(f"\n   Columns in Neon ({len(cols)}):")
    for col_name, dtype in cols:
        print(f"     {col_name:<20} {dtype}")
    print(f"\n   Sample rows (sale_date / sale_time are the typed columns):")
    for row in sample:
        print(f"     {dict(row._mapping)}")


def main():
    print("=" * 52)
    print("  WALMART — MIGRATE TO NEON POSTGRESQL")
    print("=" * 52)

    check_env()
    df = load_csv(CLEAN_PATH)

    print("\n🔗 Connecting to Neon...")
    # Force psycopg2 driver (not psycopg3) — replace postgresql:// with postgresql+psycopg2://
    db_url = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
    engine = create_engine(db_url, pool_pre_ping=True)
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print("   ✅ Connected")

    migrate(df, engine)
    apply_migrations(engine)
    verify(engine)

    print("\n🎉 Migration complete!")
    print(f"   Table   : {TABLE_NAME}")
    print(f"   Rows    : {len(df):,}")
    print(f"   Columns : {len(df.columns)}")
    print("\n   Your Neon database is ready for the AI analyst.")


if __name__ == "__main__":
    main()
