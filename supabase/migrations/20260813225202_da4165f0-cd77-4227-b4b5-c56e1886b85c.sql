-- 1. Definir o search_path da função para segurança
ALTER FUNCTION public.clean_historico_audit_fifo() SET search_path = public;

-- 2. Revogar execução pública para evitar que qualquer um chame a função manualmente
REVOKE EXECUTE ON FUNCTION public.clean_historico_audit_fifo() FROM public;
REVOKE EXECUTE ON FUNCTION public.clean_historico_audit_fifo() FROM anon;
REVOKE EXECUTE ON FUNCTION public.clean_historico_audit_fifo() FROM authenticated;

-- 3. Garantir que apenas o service_role e o sistema de trigger possam executar
GRANT EXECUTE ON FUNCTION public.clean_historico_audit_fifo() TO service_role;
