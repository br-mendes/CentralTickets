-- =============================================================================
-- SCRIPT COMPLETO DE CORREÇÃO — executar no Supabase SQL Editor
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. tickets_cache: garantir todas as colunas necessárias
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tickets_cache
  ADD COLUMN IF NOT EXISTS technician        TEXT,
  ADD COLUMN IF NOT EXISTS technician_id     INTEGER              DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requester_id      INTEGER              DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impact            INTEGER              DEFAULT 3,
  ADD COLUMN IF NOT EXISTS priority_id       INTEGER              DEFAULT 3,
  ADD COLUMN IF NOT EXISTS type_id           INTEGER              DEFAULT 2,
  ADD COLUMN IF NOT EXISTS global_validation INTEGER              DEFAULT 1,
  ADD COLUMN IF NOT EXISTS entity_full       TEXT                 DEFAULT '',
  ADD COLUMN IF NOT EXISTS category          TEXT                 DEFAULT '',
  ADD COLUMN IF NOT EXISTS root_category     TEXT                 DEFAULT '',
  ADD COLUMN IF NOT EXISTS date_solved       TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS date_close        TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS resolution_duration INTEGER            DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waiting_duration  INTEGER              DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location          TEXT                 DEFAULT '',
  ADD COLUMN IF NOT EXISTS sla_ttr_name      TEXT                 DEFAULT '',
  ADD COLUMN IF NOT EXISTS sla_tto_name      TEXT                 DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_overdue_first  BOOLEAN              DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_overdue_resolve BOOLEAN             DEFAULT false,
  ADD COLUMN IF NOT EXISTS solution          TEXT,
  ADD COLUMN IF NOT EXISTS last_sync         TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMP WITH TIME ZONE DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Corrigir urgency se ainda for BOOLEAN (erro: "invalid input syntax for
--    type boolean: '3'")
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets_cache' AND column_name = 'urgency'
    AND data_type = 'boolean'
  ) THEN
    ALTER TABLE tickets_cache ALTER COLUMN urgency DROP DEFAULT;
    ALTER TABLE tickets_cache ALTER COLUMN urgency TYPE INTEGER USING 3;
    ALTER TABLE tickets_cache ALTER COLUMN urgency SET DEFAULT 3;
    RAISE NOTICE 'urgency convertido de boolean para integer';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Corrigir global_validation se for BOOLEAN
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets_cache' AND column_name = 'global_validation'
    AND data_type = 'boolean'
  ) THEN
    ALTER TABLE tickets_cache ALTER COLUMN global_validation DROP DEFAULT;
    ALTER TABLE tickets_cache ALTER COLUMN global_validation TYPE INTEGER
      USING CASE WHEN global_validation THEN 2 ELSE 1 END;
    ALTER TABLE tickets_cache ALTER COLUMN global_validation SET DEFAULT 1;
    RAISE NOTICE 'global_validation convertido de boolean para integer';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CRÍTICO: índice único para o upsert funcionar
--    Sem isso TODOS os upserts falham silenciosamente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS tickets_cache_ticket_instance_unique
  ON tickets_cache (ticket_id, instance);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. sync_control: criar tabela se não existir
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_control (
  id           BIGSERIAL PRIMARY KEY,
  instance     TEXT NOT NULL,
  last_sync    TIMESTAMP WITH TIME ZONE,
  status       TEXT DEFAULT 'pending',
  tickets_count INTEGER DEFAULT 0,
  last_page    INTEGER DEFAULT 0,
  total_pages  INTEGER DEFAULT 0,
  error_message TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Colunas que podem estar faltando em versões antigas
ALTER TABLE sync_control
  ADD COLUMN IF NOT EXISTS last_page     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_pages   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CRÍTICO: constraint única em sync_control.instance
--    Sem isso o upsert de status falha → sistema nunca avança e sempre
--    começa do zero, deletando dados (bug do "salva tudo e apaga").
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_has_unique BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'sync_control' AND c.contype IN ('u','p')
    AND pg_get_constraintdef(c.oid) LIKE '%instance%'
  ) INTO v_has_unique;

  IF NOT v_has_unique THEN
    -- Remove duplicatas mantendo o mais recente
    DELETE FROM sync_control s1
    USING sync_control s2
    WHERE s1.id < s2.id AND s1.instance = s2.instance;
    -- Adiciona constraint
    ALTER TABLE sync_control ADD CONSTRAINT sync_control_instance_unique UNIQUE (instance);
    RAISE NOTICE 'UNIQUE constraint adicionada em sync_control.instance';
  ELSE
    RAISE NOTICE 'sync_control.instance já tem UNIQUE constraint';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. sync_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_logs (
  id                BIGSERIAL PRIMARY KEY,
  instance          TEXT,
  started_at        TIMESTAMP WITH TIME ZONE DEFAULT now(),
  finished_at       TIMESTAMP WITH TIME ZONE,
  status            TEXT,
  tickets_processed INTEGER DEFAULT 0,
  error_message     TEXT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Índices de performance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_cache_status    ON tickets_cache(status_key);
CREATE INDEX IF NOT EXISTS idx_tickets_cache_instance  ON tickets_cache(instance);
CREATE INDEX IF NOT EXISTS idx_tickets_cache_date_mod  ON tickets_cache(date_mod DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_cache_is_deleted ON tickets_cache(is_deleted);
CREATE INDEX IF NOT EXISTS idx_tickets_cache_sla        ON tickets_cache(is_sla_late, is_overdue_resolve);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Realtime (também habilitar em: Dashboard → Database → Replication)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tickets_cache;
EXCEPTION WHEN OTHERS THEN
  NULL; -- já está na publicação ou publicação não existe
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Reset do controle de sync (força full sync na próxima chamada)
--     NÃO apaga os tickets — só reseta o status de progresso.
--     Descomente se quiser apagar os tickets também.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM sync_control;
-- DELETE FROM tickets_cache WHERE instance = 'PETA';
-- DELETE FROM tickets_cache WHERE instance = 'GMX';

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Verificação final
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'tickets_cache' AS tabela, COUNT(*) AS linhas FROM tickets_cache
UNION ALL
SELECT 'sync_control', COUNT(*) FROM sync_control
UNION ALL
SELECT 'sync_logs', COUNT(*) FROM sync_logs;

SELECT
  constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name IN ('tickets_cache', 'sync_control')
ORDER BY table_name, constraint_type;
