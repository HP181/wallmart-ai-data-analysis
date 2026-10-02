"""
Walmart Data Pipeline — Step 1: Clean & Feature Engineering
Location: wallmart-ai-data-analysis/scripts/clean_data.py

Run from the project root:
    npm run pipeline:clean
  or directly:
    python scripts/clean_data.py
"""

import pandas as pd
import numpy as np
import os

# ─── Paths (relative to project root) ────────────────────────────────────────
PROJECT_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
RAW_PATH     = os.path.join(PROJECT_ROOT, "public", "Walmart_raw_data.csv")
CLEAN_PATH   = os.path.join(PROJECT_ROOT, "public", "Walmart_cleaned_data.csv")


def load_raw(path: str) -> pd.DataFrame:
    if not os.path.exists(path):
        print(f"❌ Raw CSV not found: {path}")
        raise SystemExit(1)
    df = pd.read_csv(path)
    print(f"✅ Loaded raw data: {df.shape[0]:,} rows × {df.shape[1]} columns")
    return df


def run_eda(df: pd.DataFrame, label: str = "") -> None:
    print(f"\n{'─'*52}")
    print(f"  EDA {label}")
    print(f"{'─'*52}")
    print(f"  Shape      : {df.shape}")
    print(f"  Duplicates : {df.duplicated().sum()}")
    print(f"  Nulls      :\n{df.isnull().sum().to_string()}")
    print(f"\n  Dtypes:\n{df.dtypes.to_string()}")
    print(f"\n  Sample (3 rows):\n{df.head(3).to_string()}")
    print(f"\n  Describe:\n{df.describe(include='all').to_string()}")


def clean(df: pd.DataFrame) -> pd.DataFrame:
    print("\n🔧 Cleaning...")

    # 1. Lowercase + strip column names
    df.columns = df.columns.str.lower().str.strip()

    # 2. Remove duplicates
    before = len(df)
    df = df.drop_duplicates()
    print(f"   Removed duplicates   : {before - len(df)} rows")

    # 3. Remove nulls
    before = len(df)
    df = df.dropna()
    print(f"   Removed null rows    : {before - len(df)} rows")

    # 4. Fix unit_price — strip $ and cast to float
    df["unit_price"] = (
        df["unit_price"]
        .astype(str)
        .str.replace("$", "", regex=False)
        .str.strip()
        .astype(float)
    )

    # 5. Cast quantity to int
    df["quantity"] = df["quantity"].astype(int)

    # 6. Validate ranges
    before = len(df)
    df = df[
        df["rating"].between(1, 10) &
        df["profit_margin"].between(0, 1) &
        (df["unit_price"] > 0) &
        (df["quantity"] > 0)
    ]
    print(f"   Removed out-of-range : {before - len(df)} rows")
    print(f"   ✅ Clean rows        : {len(df):,}")

    return df.reset_index(drop=True)


def feature_engineering(df: pd.DataFrame) -> pd.DataFrame:
    print("\n⚙️  Feature engineering...")

    # total revenue
    df["total"] = (df["unit_price"] * df["quantity"]).round(2)

    # profit in dollars
    df["profit_amount"] = (df["unit_price"] * df["quantity"] * df["profit_margin"]).round(2)

    # ── date features ─────────────────────────────────────────────────────────
    # Raw format: DD/MM/YY e.g. "05/01/19"
    df["_date"] = pd.to_datetime(df["date"], format="%d/%m/%y", errors="coerce")
    nulls = df["_date"].isnull().sum()
    if nulls:
        print(f"   ⚠️  {nulls} unparseable dates dropped")
        df = df.dropna(subset=["_date"])

    df["year"]        = df["_date"].dt.year
    df["month"]       = df["_date"].dt.month
    df["month_name"]  = df["_date"].dt.strftime("%B")
    df["day_of_week"] = df["_date"].dt.strftime("%A")
    df["week_number"] = df["_date"].dt.isocalendar().week.astype(int)
    df = df.drop(columns=["_date"])

    # ── time features ─────────────────────────────────────────────────────────
    df["_time"] = pd.to_datetime(df["time"], format="%H:%M:%S", errors="coerce")
    nulls = df["_time"].isnull().sum()
    if nulls:
        print(f"   ⚠️  {nulls} unparseable times dropped")
        df = df.dropna(subset=["_time"])

    df["hour"] = df["_time"].dt.hour
    df["shift"] = pd.cut(
        df["hour"],
        bins=[-1, 11, 17, 23],
        labels=["Morning", "Afternoon", "Evening"]
    ).astype(str)
    df = df.drop(columns=["_time"])

    # revenue tier
    df["revenue_tier"] = pd.cut(
        df["total"],
        bins=[0, 50, 200, float("inf")],
        labels=["Low", "Medium", "High"]
    ).astype(str)

    new_cols = ["total", "profit_amount", "year", "month", "month_name",
                "day_of_week", "week_number", "hour", "shift", "revenue_tier"]
    print(f"   New columns ({len(new_cols)}) : {new_cols}")
    print(f"   ✅ Final shape       : {df.shape}")

    return df.reset_index(drop=True)


def validate(df: pd.DataFrame) -> None:
    print("\n🔍 Validation...")
    issues = []

    if df.isnull().any().any():
        issues.append(f"Nulls: {df.isnull().sum()[df.isnull().sum() > 0].to_dict()}")
    if (df["unit_price"] <= 0).any():
        issues.append("unit_price has non-positive values")
    if (df["quantity"] <= 0).any():
        issues.append("quantity has non-positive values")
    if not df["rating"].between(1, 10).all():
        issues.append("rating out of 1–10 range")
    if not df["profit_margin"].between(0, 1).all():
        issues.append("profit_margin out of 0–1 range")

    if issues:
        for i in issues:
            print(f"   ❌ {i}")
    else:
        print("   ✅ All checks passed")

    print(f"\n📊 Summary:")
    print(f"   Rows          : {len(df):,}")
    print(f"   Columns       : {len(df.columns)}")
    print(f"   Date range    : {df['year'].min()} – {df['year'].max()}")
    print(f"   Categories    : {sorted(df['category'].unique())}")
    print(f"   Branches      : {len(df['branch'].unique())} branches")
    print(f"   Cities        : {sorted(df['city'].unique())}")
    print(f"   Payment types : {sorted(df['payment_method'].unique())}")
    print(f"   Shifts        : {df['shift'].value_counts().to_dict()}")
    print(f"   Total revenue : ${df['total'].sum():,.2f}")
    print(f"   Total profit  : ${df['profit_amount'].sum():,.2f}")
    print(f"   Avg rating    : {df['rating'].mean():.2f}")


def main():
    print("=" * 52)
    print("  WALMART — CLEAN & FEATURE ENGINEERING")
    print("=" * 52)

    df = load_raw(RAW_PATH)
    run_eda(df, "(Before)")
    df = clean(df)
    df = feature_engineering(df)
    run_eda(df, "(After)")
    validate(df)

    df.to_csv(CLEAN_PATH, index=False)
    print(f"\n💾 Saved → {CLEAN_PATH}")
    print("\n✅ Done! Run  npm run pipeline:migrate  next.")


if __name__ == "__main__":
    main()
