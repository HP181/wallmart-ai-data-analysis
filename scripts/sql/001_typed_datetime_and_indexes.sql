-- 001: typed date/time columns and indexes for the `walmart` table.
--
-- Idempotent: safe to run repeatedly (npm run db:migrate).
--
-- The raw `date` ('DD/MM/YY') and `time` ('H:MM:SS' or 'HH:MM:SS') columns are
-- TEXT, which sorts and filters incorrectly ('31/01/19' sorts after '05/12/23').
-- Rather than rewriting those columns (and breaking existing readers), this adds
-- STORED generated columns that are derived from them, so the typed values can
-- never drift from the source text.
--
-- split_part() is used instead of fixed-width substr() because the data
-- contains single-digit hours such as '9:05:00'.

ALTER TABLE walmart
  ADD COLUMN IF NOT EXISTS sale_date date GENERATED ALWAYS AS (
    make_date(
      2000 + split_part("date", '/', 3)::int,
      split_part("date", '/', 2)::int,
      split_part("date", '/', 1)::int
    )
  ) STORED;

ALTER TABLE walmart
  ADD COLUMN IF NOT EXISTS sale_time time GENERATED ALWAYS AS (
    make_time(
      split_part("time", ':', 1)::int,
      split_part("time", ':', 2)::int,
      split_part("time", ':', 3)::double precision
    )
  ) STORED;

-- invoice_id is the keyset-pagination key used by the streaming CSV export, so
-- it must be unique. (It is unique in the cleaned dataset.)
CREATE UNIQUE INDEX IF NOT EXISTS walmart_invoice_id_key ON walmart (invoice_id);

-- Common grouping / filtering columns. The first eight names match the indexes
-- the Python loader has always created, so existing databases do not get
-- duplicates.
CREATE INDEX IF NOT EXISTS idx_category     ON walmart (category);
CREATE INDEX IF NOT EXISTS idx_branch       ON walmart (branch);
CREATE INDEX IF NOT EXISTS idx_city         ON walmart (city);
CREATE INDEX IF NOT EXISTS idx_year         ON walmart (year);
CREATE INDEX IF NOT EXISTS idx_month        ON walmart (month);
CREATE INDEX IF NOT EXISTS idx_shift        ON walmart (shift);
CREATE INDEX IF NOT EXISTS idx_payment      ON walmart (payment_method);
CREATE INDEX IF NOT EXISTS idx_hour         ON walmart (hour);
CREATE INDEX IF NOT EXISTS idx_day_of_week  ON walmart (day_of_week);
CREATE INDEX IF NOT EXISTS idx_revenue_tier ON walmart (revenue_tier);
CREATE INDEX IF NOT EXISTS idx_sale_date    ON walmart (sale_date);

ANALYZE walmart;
