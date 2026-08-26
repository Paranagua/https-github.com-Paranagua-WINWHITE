# Plano de Correção de Segurança e Auditoria - Tabela `historico_sinais_audit`

Este plano visa corrigir as vulnerabilidades de segurança apontadas no Supabase e implementar um mecanismo de auto-limpeza (FIFO) para a tabela de auditoria de sinais.

## Alterações Propostas

### 1. Segurança e RLS (Row Level Security)

- **Leitura Pública**: Manteremos a permissão de leitura (`SELECT`) pública (`anon`) para que o site continue exibindo as estatísticas sem exigir login, conforme solicitado.
- **Restrição de Inserção**: Refinaremos a política de `INSERT` para que apenas usuários autenticados possam inserir dados, aplicando validações rigorosas:
  - `analise` não pode ser nula.
  - `status` deve ser obrigatoriamente um dos valores: 'PENDENTE', 'WIN_DIRETO', 'WIN_VIZINHO', 'LOSS'.
  - Restrição temporal: O `minuto_alvo` não pode ser uma data excessivamente futura ou passada (janela de segurança).

### 2. Gatilho de Limite FIFO (Prevenção de Inundação)

- Implementaremos uma função e um gatilho (`trigger`) que monitora as inserções na tabela `historico_sinais_audit`.
- Sempre que o número de registros exceder 500, os registros mais antigos serão automaticamente removidos, garantindo que o banco de dados não sofra com excesso de dados irrelevantes.

## Detalhes Técnicos

### SQL Migration

```sql
-- 1. Ajustar permissões e RLS
GRANT SELECT ON public.historico_sinais_audit TO anon;

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.historico_sinais_audit;

CREATE POLICY "Restricted INSERT for authenticated users"
ON public.historico_sinais_audit FOR INSERT
TO authenticated
WITH CHECK (
    analise IS NOT NULL AND
    status IN ('PENDENTE', 'WIN_DIRETO', 'WIN_VIZINHO', 'LOSS') AND
    char_length(analise) <= 100 AND
    minuto_alvo > (now() - interval '1 day') AND
    minuto_alvo < (now() + interval '1 day')
);

-- 2. Implementar FIFO (First-In, First-Out)
CREATE OR REPLACE FUNCTION public.maintain_audit_limit()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.historico_sinais_audit
    WHERE id IN (
        SELECT id FROM public.historico_sinais_audit
        ORDER BY created_at DESC
        OFFSET 500
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_fifo ON public.historico_sinais_audit;
CREATE TRIGGER trigger_audit_fifo
AFTER INSERT ON public.historico_sinais_audit
FOR EACH STATEMENT
EXECUTE FUNCTION public.maintain_audit_limit();
```

Este conjunto de alterações garante que o sistema permaneça funcional para os visitantes (leitura pública), mas seguro contra abusos de inserção e eficiente em termos de armazenamento.
