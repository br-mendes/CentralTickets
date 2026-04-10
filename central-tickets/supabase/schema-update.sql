-- =====================================================
-- Script SQL - Execute no SQL Editor do Supabase
-- =====================================================

-- 1. Adicionar colunas faltantes na tabela tickets_cache
ALTER TABLE tickets_cache 
ADD COLUMN IF NOT EXISTS technician TEXT,
ADD COLUMN IF NOT EXISTS time_to_own TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS time_to_resolve TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_overdue_first BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_overdue_resolve BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sla_percentage_first INTEGER,
ADD COLUMN IF NOT EXISTS sla_percentage_resolve INTEGER,
ADD COLUMN IF NOT EXISTS pending_reason TEXT;

-- 2. Criar índice para melhorar performance de consultas
CREATE INDEX IF NOT EXISTS idx_tickets_cache_status 
ON tickets_cache(status_key);

CREATE INDEX IF NOT EXISTS idx_tickets_cache_instance 
ON tickets_cache(instance);

CREATE INDEX IF NOT EXISTS idx_tickets_cache_date_mod 
ON tickets_cache(date_mod DESC);

-- 3. Verificar estrutura final
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickets_cache' 
ORDER BY ordinal_position;
