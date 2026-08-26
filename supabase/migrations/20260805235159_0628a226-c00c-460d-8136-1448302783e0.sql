-- Remover políticas permissivas
DROP POLICY IF EXISTS "Allow public update" ON public.gatilhos_analise;
DROP POLICY IF EXISTS "Allow public delete" ON public.gatilhos_analise;
DROP POLICY IF EXISTS "Allow public insert" ON public.gatilhos_analise;

-- Garantir que apenas a política validada exista para inserção
-- (Assumindo que 'gatilhos insercao validada' já existe ou foi criada anteriormente)

-- Adicionar permissões explícitas para service_role se necessário
GRANT ALL ON public.gatilhos_analise TO service_role;
