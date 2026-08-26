-- Corrigir alerta de search_path na função
ALTER FUNCTION public.maintain_audit_limit() SET search_path = public;