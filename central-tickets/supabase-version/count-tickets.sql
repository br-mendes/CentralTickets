-- ======================================================
-- Contagem de Tickets por Instância
-- Supabase SQL Editor
-- ======================================================

-- Total por instância
SELECT 
    instance,
    COUNT(*) as total_tickets
FROM tickets_cache
GROUP BY instance
ORDER BY instance;

-- ======================================================
-- Detalhamento por Status
-- ======================================================

SELECT 
    instance,
    status,
    COUNT(*) as total
FROM tickets_cache
GROUP BY instance, status
ORDER BY instance, status;

-- ======================================================
-- Tickets Abertos (Não fechados/solucionados)
-- ======================================================

SELECT 
    instance,
    status,
    COUNT(*) as total
FROM tickets_cache
WHERE status NOT IN ('Closed', 'Solucionado', 'solved', 'closed')
GROUP BY instance, status
ORDER BY instance, status;

-- ======================================================
-- Resumo Geral
-- ======================================================

SELECT 
    instance,
    COUNT(*) as total,
    COUNT(CASE WHEN status IN ('new', 'Novo', '1') THEN 1 END) as novos,
    COUNT(CASE WHEN status IN ('processing', 'Em atendimento', '2', '3') THEN 1 END) as em_atendimento,
    COUNT(CASE WHEN status IN ('pending', 'Pendente', '4') THEN 1 END) as pendentes,
    COUNT(CASE WHEN status IN ('pending-approval', 'Aprovação', '7') THEN 1 END) as aprovacao,
    COUNT(CASE WHEN status IN ('solved', 'Solucionado', '5') THEN 1 END) as solucionados,
    COUNT(CASE WHEN status IN ('closed', 'Fechado', '6') THEN 1 END) as fechados
FROM tickets_cache
GROUP BY instance
ORDER BY instance;