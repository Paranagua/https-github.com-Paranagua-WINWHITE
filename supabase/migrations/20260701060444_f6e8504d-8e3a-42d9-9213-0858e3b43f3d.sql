CREATE SCHEMA IF NOT EXISTS extensions;

DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;