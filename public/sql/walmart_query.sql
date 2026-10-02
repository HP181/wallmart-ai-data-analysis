-- ============================================================
--  Walmart Sales Analysis — PostgreSQL Queries (Neon)
--  Reference queries used by the AI analyst
--  MySQL original converted to PostgreSQL syntax
-- ============================================================

-- Quick checks
SELECT * FROM walmart LIMIT 10;
SELECT COUNT(*) FROM walmart;
SELECT COUNT(DISTINCT branch) FROM walmart;

-- ============================================================
-- #1. Payment methods — transaction count & quantity sold
-- ============================================================
SELECT
    payment_method,
    COUNT(*)        AS transactions,
    SUM(quantity)   AS items_sold
FROM walmart
GROUP BY payment_method
ORDER BY transactions DESC;

-- ============================================================
-- #2. Highest-rated category per branch
-- ============================================================
SELECT branch, category, avg_rating
FROM (
    SELECT
        branch,
        category,
        ROUND(AVG(rating)::numeric, 2) AS avg_rating,
        RANK() OVER (PARTITION BY branch ORDER BY AVG(rating) DESC) AS rnk
    FROM walmart
    GROUP BY branch, category
) ranked
WHERE rnk = 1;

-- ============================================================
-- #3. Busiest day per branch  (uses day_of_week feature column)
-- ============================================================
SELECT branch, day_of_week, transactions
FROM (
    SELECT
        branch,
        day_of_week,
        COUNT(*) AS transactions,
        RANK() OVER (PARTITION BY branch ORDER BY COUNT(*) DESC) AS rnk
    FROM walmart
    GROUP BY branch, day_of_week
) ranked
WHERE rnk = 1;

-- ============================================================
-- #4. Total quantity sold per payment method
-- ============================================================
SELECT
    payment_method,
    SUM(quantity) AS items_sold
FROM walmart
GROUP BY payment_method
ORDER BY items_sold DESC;

-- ============================================================
-- #5. Rating stats (avg / min / max) per city & category
-- ============================================================
SELECT
    city,
    category,
    ROUND(MIN(rating)::numeric, 2) AS min_rating,
    ROUND(MAX(rating)::numeric, 2) AS max_rating,
    ROUND(AVG(rating)::numeric, 2) AS avg_rating
FROM walmart
GROUP BY city, category
ORDER BY city, category;

-- ============================================================
-- #6. Total profit per category
-- ============================================================
SELECT
    category,
    ROUND(SUM(profit_amount)::numeric, 2) AS total_profit
FROM walmart
GROUP BY category
ORDER BY total_profit DESC;

-- ============================================================
-- #7. Most common payment method per branch
-- ============================================================
WITH cte AS (
    SELECT
        branch,
        payment_method,
        COUNT(*) AS transactions,
        RANK() OVER (PARTITION BY branch ORDER BY COUNT(*) DESC) AS rnk
    FROM walmart
    GROUP BY branch, payment_method
)
SELECT branch, payment_method AS preferred_payment_method
FROM cte
WHERE rnk = 1;

-- ============================================================
-- #8. Sales by shift per branch  (uses shift feature column)
-- ============================================================
SELECT
    branch,
    shift,
    COUNT(*) AS num_invoices
FROM walmart
GROUP BY branch, shift
ORDER BY branch, num_invoices DESC;

-- ============================================================
-- #9. Top 5 branches with highest revenue decline (year-on-year)
--     Uses year feature column
-- ============================================================
WITH revenue_prev AS (
    SELECT branch, SUM(total) AS revenue
    FROM walmart
    WHERE year = (SELECT MIN(year) FROM walmart)
    GROUP BY branch
),
revenue_curr AS (
    SELECT branch, SUM(total) AS revenue
    FROM walmart
    WHERE year = (SELECT MAX(year) FROM walmart)
    GROUP BY branch
)
SELECT
    p.branch,
    ROUND(p.revenue::numeric, 2)                                           AS prev_year_revenue,
    ROUND(c.revenue::numeric, 2)                                           AS curr_year_revenue,
    ROUND(((p.revenue - c.revenue) / p.revenue * 100)::numeric, 2)        AS revenue_decline_pct
FROM revenue_prev p
JOIN revenue_curr c ON p.branch = c.branch
WHERE p.revenue > c.revenue
ORDER BY revenue_decline_pct DESC
LIMIT 5;

-- ============================================================
-- #10. Revenue by category and month  (new — uses feature cols)
-- ============================================================
SELECT
    category,
    month_name,
    month,
    ROUND(SUM(total)::numeric, 2) AS revenue
FROM walmart
GROUP BY category, month_name, month
ORDER BY category, month;

-- ============================================================
-- #11. Peak sales hours across all branches  (uses hour col)
-- ============================================================
SELECT
    hour,
    COUNT(*) AS transactions,
    ROUND(SUM(total)::numeric, 2) AS revenue
FROM walmart
GROUP BY hour
ORDER BY transactions DESC;
