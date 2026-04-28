-- Verificar se as tabelas existem
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('tickets_cache', 'sync_control', 'sync_logs');

-- Verificar sync_control
SELECT * FROM sync_control ORDER BY instance;

-- Verificar último sync
SELECT * FROM sync_logs ORDER BY finished_at DESC LIMIT 5;