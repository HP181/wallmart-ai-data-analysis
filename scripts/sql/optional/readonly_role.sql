-- OPTIONAL: a SELECT-only database role for the web app.
--
-- Not run by `npm run db:migrate`. Run it once, as the database owner (in the
-- Neon SQL editor or psql), after replacing the password. Then set
-- DATABASE_URL_READONLY to this role's connection string.
--
-- With this role the database itself refuses writes, DDL and long-running
-- queries, no matter what the application does. The app additionally runs
-- every query in a READ ONLY transaction with a statement timeout, so this is
-- the second, independent layer.

CREATE ROLE walmart_readonly LOGIN PASSWORD 'CHANGE_ME';

GRANT USAGE ON SCHEMA public TO walmart_readonly;
GRANT SELECT ON TABLE walmart TO walmart_readonly;

-- `npm run pipeline:migrate` DROPS and recreates the table, which discards
-- its grants. Default privileges make the new table readable again
-- automatically (they apply to tables later created by the role that runs
-- this script, i.e. the owner the pipeline connects as).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO walmart_readonly;

-- Enforced by the server for every session of this role:
ALTER ROLE walmart_readonly SET default_transaction_read_only = on;
ALTER ROLE walmart_readonly SET statement_timeout = '8s';
ALTER ROLE walmart_readonly SET idle_in_transaction_session_timeout = '10s';
