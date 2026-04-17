-- =============================================================
-- CentralTickets - Migração v2
-- Execute no Supabase Dashboard > SQL Editor
-- =============================================================

-- ============================================================
-- 1. Adicionar colunas ausentes em tickets_cache
-- ============================================================

-- Tipo do chamado: 1=Incidente, 2=Requisição (padrão GLPI)
ALTER TABLE tickets_cache
    ADD COLUMN IF NOT EXISTS type_id INTEGER DEFAULT 2;

-- Conteúdo da solução (texto GLPI)
ALTER TABLE tickets_cache
    ADD COLUMN IF NOT EXISTS solution_content TEXT;

-- Data/hora em que o ticket foi solucionado
ALTER TABLE tickets_cache
    ADD COLUMN IF NOT EXISTS date_solved TIMESTAMPTZ;

-- Prioridade: 1=Baixa, 2=Média, 3=Alta, 4=Urgente, 5=Crítica
ALTER TABLE tickets_cache
    ADD COLUMN IF NOT EXISTS priority_id INTEGER DEFAULT 1;

-- Campo de busca rápida: flag de pendência de aprovação (status_id=7)
ALTER TABLE tickets_cache
    ADD COLUMN IF NOT EXISTS is_pending_approval BOOLEAN GENERATED ALWAYS AS (status_id = 7) STORED;

-- ============================================================
-- 2. Atualizar a função get_status_key para cobrir o status 7
-- ============================================================

CREATE OR REPLACE FUNCTION get_status_key(status_id INTEGER)
RETURNS VARCHAR(50) AS $$
BEGIN
    RETURN CASE status_id
        WHEN 1 THEN 'new'
        WHEN 2 THEN 'processing'
        WHEN 3 THEN 'processing'
        WHEN 4 THEN 'pending'
        WHEN 5 THEN 'solved'
        WHEN 6 THEN 'closed'
        WHEN 7 THEN 'pending-approval'
        ELSE 'new'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION get_status_name(status_id INTEGER)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE status_id
        WHEN 1 THEN 'Novo'
        WHEN 2 THEN 'Em atendimento'
        WHEN 3 THEN 'Em atendimento'
        WHEN 4 THEN 'Pendente'
        WHEN 5 THEN 'Solucionado'
        WHEN 6 THEN 'Fechado'
        WHEN 7 THEN 'Aprovação'
        ELSE 'Novo'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 3. Índices de performance para as novas colunas
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tickets_cache_type_id
    ON tickets_cache(type_id);

CREATE INDEX IF NOT EXISTS idx_tickets_cache_priority_id
    ON tickets_cache(priority_id);

CREATE INDEX IF NOT EXISTS idx_tickets_cache_pending_approval
    ON tickets_cache(instance, status_id)
    WHERE status_id = 7;

CREATE INDEX IF NOT EXISTS idx_tickets_cache_solution
    ON tickets_cache(instance, status_id, solution_content)
    WHERE solution_content IS NULL AND status_id IN (5, 6);

-- ============================================================
-- 4. Atualizar registros existentes com type_id
--    (usa raw_data->>'14' se disponível, senão default 2=Requisição)
-- ============================================================

UPDATE tickets_cache
SET type_id = COALESCE(
    NULLIF((raw_data->>'14')::INTEGER, 0),
    NULLIF((raw_data->>'type')::INTEGER, 0),
    2
)
WHERE type_id IS NULL OR type_id = 2;

-- Atualizar status_key para tickets com status_id=7 que ficaram como 'new'
UPDATE tickets_cache
SET status_key = 'pending-approval',
    status_name = 'Aprovação'
WHERE status_id = 7
  AND (status_key IS NULL OR status_key NOT IN ('pending-approval'));

-- ============================================================
-- 5. Limpar entidades com prefixo PETA > ou GMX TECNOLOGIA >
--    (mantém entity_full intacta, limpa apenas entity)
-- ============================================================

UPDATE tickets_cache
SET entity = REGEXP_REPLACE(
    REGEXP_REPLACE(
        REGEXP_REPLACE(entity, '^PETA\s*>\s*', '', 'i'),
        '^GMX\s+TECNOLOGIA\s*>\s*', '', 'i'
    ),
    '^GMX\s*>\s*', '', 'i'
)
WHERE entity ~ '^(PETA|GMX)\s*>';

-- ============================================================
-- 6. Verificação: listar colunas atuais de tickets_cache
-- ============================================================

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'tickets_cache'
ORDER BY ordinal_position;
