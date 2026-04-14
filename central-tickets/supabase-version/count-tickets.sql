-- ======================================================
-- Contagem de Tickets por Instância
-- Supabase SQL Editor
-- ======================================================

-- 1. Total por instância
SELECT 
    instance,
    COUNT(*) as total_tickets
FROM tickets_cache
GROUP BY instance
ORDER BY instance;

-- 2. Detalhamento por Status ID
SELECT 
    instance,
    status_id,
    COUNT(*) as total
FROM tickets_cache
GROUP BY instance, status_id
ORDER BY instance, status_id;

-- 3. Tickets em aberto (status_id não é 5 ou 6)
SELECT 
    instance,
    status_id,
    COUNT(*) as total
FROM tickets_cache
WHERE status_id NOT IN (5, 6)
GROUP BY instance, status_id
ORDER BY instance, status_id;

-- 4. Resumo Geral
SELECT 
    instance,
    COUNT(*) as total,
    COUNT(CASE WHEN status_id = 1 THEN 1 END) as novos,
    COUNT(CASE WHEN status_id IN (2, 3) THEN 1 END) as em_atendimento,
    COUNT(CASE WHEN status_id = 4 THEN 1 END) as pendentes,
    COUNT(CASE WHEN status_id = 7 THEN 1 END) as aprovacao,
    COUNT(CASE WHEN status_id = 5 THEN 1 END) as solucionados,
    COUNT(CASE WHEN status_id = 6 THEN 1 END) as fechados
FROM tickets_cache
GROUP BY instance
ORDER BY instance;

-- Status ID reference:
-- 1 = Novo
-- 2 = Em atendimento (processando)
-- 3 = Em atendimento (processando)
-- 4 = Pendente
-- 5 = Solucionado
-- 6 = Fechado
-- 7 = Aprovação