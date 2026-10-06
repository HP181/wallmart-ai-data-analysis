"""
Walmart Data Pipeline - Apply SQL migrations
Location: wallmart-ai-data-analysis/scripts/apply_migrations.py

Runs every scripts/sql/*.sql file, in filename order, against the database in
DATABASE_URL_UNPOOLED (or DATABASE_URL) from .env.local. Files are idempotent,
so this is safe to run any number of times. Files under scripts/sql/optional/
are never run automatically.

Run from the project root:
    npm run db:migrate
  or directly:
    python scripts/apply_migrations.py

Requirements:
    pip install sqlalchemy psycopg2-binary python-dotenv
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SQL_DIR = PROJECT_ROOT / "scripts" / "sql"
ENV_PATH = PROJECT_ROOT / ".env.local"


def get_database_url() -> str:
    load_dotenv(ENV_PATH)
    # Migrations use the direct (unpooled) connection: pgBouncer can interfere with DDL.
    url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL not set.")
        print(f"   Add it to {ENV_PATH}:")
        print("   DATABASE_URL=postgresql://user:pass@host/db?sslmode=require")
        raise SystemExit(1)
    return url


def make_engine(url: str):
    # Force the psycopg2 driver (not psycopg3).
    return create_engine(url.replace("postgresql://", "postgresql+psycopg2://", 1), pool_pre_ping=True)


def migration_files() -> list[Path]:
    """Top-level *.sql files only, in order. scripts/sql/optional/ is skipped."""
    return sorted(p for p in SQL_DIR.glob("*.sql") if p.is_file())


def apply_sql_migrations(engine) -> None:
    files = migration_files()
    if not files:
        print("   No migration files found.")
        return
    # A raw DBAPI cursor is used so each file can contain many statements and
    # characters such as '%' are passed to Postgres untouched.
    raw = engine.raw_connection()
    try:
        for path in files:
            print(f"   applying {path.name} ...")
            with raw.cursor() as cur:
                cur.execute(path.read_text(encoding="utf-8"))
            raw.commit()
            print(f"   done     {path.name}")
    except Exception:
        raw.rollback()
        raise
    finally:
        raw.close()


def verify(engine) -> None:
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT COUNT(*), MIN(sale_date), MAX(sale_date), COUNT(sale_time) FROM walmart"
        )).one()
    print(f"   rows={row[0]:,}  sale_date {row[1]} .. {row[2]}  typed times={row[3]:,}")


def main() -> None:
    print("=" * 52)
    print("  WALMART - APPLY SQL MIGRATIONS")
    print("=" * 52)
    engine = make_engine(get_database_url())
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print("   connected")
    apply_sql_migrations(engine)
    verify(engine)
    print("\nMigrations complete.")


if __name__ == "__main__":
    main()
