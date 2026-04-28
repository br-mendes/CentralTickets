-- =====================================================
-- Script SQL - Execute no SQL Editor do Supabase
-- =====================================================

-- 1. Adicionar colunas faltantes na tabela tickets_cache
ALTER TABLE tickets_cache 
ADD COLUMN IF NOT EXISTS technician TEXT,
ADD COLUMN IF NOT EXISTS technician_id INTEGER DEFAULT 0,
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

-- 3. Adicionar coluna para controle de progresso (página atual)
ALTER TABLE sync_control 
ADD COLUMN IF NOT EXISTS last_page INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_pages INTEGER DEFAULT 0;

-- 4. Criar função RPC para contar tickets por instância
CREATE OR REPLACE FUNCTION get_ticket_counts()
RETURNS TABLE(instance TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY 
  SELECT t.instance::TEXT, COUNT(*)::BIGINT 
  FROM tickets_cache t 
  GROUP BY t.instance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Verificar contagem total
SELECT instance, COUNT(*) as total 
FROM tickets_cache 
GROUP BY instance 
ORDER BY instance;
