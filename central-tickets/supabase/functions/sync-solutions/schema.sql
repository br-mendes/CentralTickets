-- SQL para adicionar coluna solution_content à tabela tickets_cache
-- Executar no Supabase SQL Editor

-- 1. Adicionar coluna solution_content se não existir
ALTER TABLE tickets_cache 
ADD COLUMN IF NOT EXISTS solution_content TEXT;

-- 2. Criar índice para buscar tickets sem solução (otimiza a_edge function)
CREATE INDEX IF NOT EXISTS idx_tickets_cache_pending_solution 
ON tickets_cache(instance, status_id, solution_content)
WHERE solution_content IS NULL;

-- 3. Verificar se a coluna foi criada
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickets_cache' 
AND column_name = 'solution_content';