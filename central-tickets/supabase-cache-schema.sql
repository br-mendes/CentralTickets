-- =====================================================
-- Central de Tickets - Script de Cache Supabase
-- Executar no Supabase Dashboard > SQL Editor
-- =====================================================

-- =====================================================
-- 1. CRIAÇÃO DAS TABELAS
-- =====================================================

-- Tabela principal de tickets (cache)
CREATE TABLE IF NOT EXISTS tickets_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id INTEGER NOT NULL,
    instance VARCHAR(50) NOT NULL,
    title TEXT,
    entity TEXT,
    entity_full TEXT,
    category TEXT,
    root_category TEXT,
    status_id INTEGER,
    status_key VARCHAR(50),
    status_name TEXT,
    group_name TEXT,
    date_created TIMESTAMPTZ,
    date_mod TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    is_sla_late BOOLEAN DEFAULT FALSE,
    sla_percentage_first NUMERIC,
    sla_percentage_resolve NUMERIC,
    pending_reason TEXT,
    raw_data JSONB,
    last_sync TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ticket_id, instance)
);

-- Índice para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_tickets_cache_instance ON tickets_cache(instance);
CREATE INDEX IF NOT EXISTS idx_tickets_cache_status ON tickets_cache(status_key);
CREATE INDEX IF NOT EXISTS idx_tickets_cache_entity ON tickets_cache(entity);
CREATE INDEX IF NOT EXISTS idx_tickets_cache_category ON tickets_cache(category);
CREATE INDEX IF NOT EXISTS idx_tickets_cache_date_created ON tickets_cache(date_created);
CREATE INDEX IF NOT EXISTS idx_tickets_cache_date_mod ON tickets_cache(date_mod);
CREATE INDEX IF NOT EXISTS idx_tickets_cache_is_sla_late ON tickets_cache(is_sla_late) WHERE is_sla_late = TRUE;
CREATE INDEX IF NOT EXISTS idx_tickets_cache_last_sync ON tickets_cache(last_sync);

-- Tabela de controle de sincronização
CREATE TABLE IF NOT EXISTS sync_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance VARCHAR(50) NOT NULL,
    last_sync TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'pending',
    tickets_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(instance)
);

-- Tabela de logs de sincronização
CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance VARCHAR(50),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(50),
    tickets_processed INTEGER DEFAULT 0,
    tickets_added INTEGER DEFAULT 0,
    tickets_updated INTEGER DEFAULT 0,
    tickets_removed INTEGER DEFAULT 0,
    error_message TEXT
);

-- Tabela de métricas por período (para relatórios)
CREATE TABLE IF NOT EXISTS tickets_metrics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance VARCHAR(50) NOT NULL,
    metric_date DATE NOT NULL,
    total_tickets INTEGER DEFAULT 0,
    new_tickets INTEGER DEFAULT 0,
    processing_tickets INTEGER DEFAULT 0,
    pending_tickets INTEGER DEFAULT 0,
    solved_tickets INTEGER DEFAULT 0,
    closed_tickets INTEGER DEFAULT 0,
    sla_late_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(instance, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_metrics_daily ON tickets_metrics_daily(instance, metric_date);

-- =====================================================
-- 2. FUNÇÕES UTILITÁRIAS
-- =====================================================

-- Função para extrair categoria raiz
CREATE OR REPLACE FUNCTION get_root_category(category TEXT)
RETURNS TEXT AS $$
BEGIN
    IF category IS NULL OR category = '' THEN
        RETURN 'Não categorizado';
    END IF;
    RETURN SPLIT_PART(category, ' > ', 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função para verificar se SLA está vencido
CREATE OR REPLACE FUNCTION check_sla_late(due_date TIMESTAMPTZ)
RETURNS BOOLEAN AS $$
BEGIN
    IF due_date IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN due_date < NOW();
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função para formatar duração em pendência
CREATE OR REPLACE FUNCTION format_pending_duration(start_date TIMESTAMPTZ)
RETURNS TEXT AS $$
DECLARE
    diff_seconds BIGINT;
    diff_minutes BIGINT;
    diff_hours BIGINT;
    diff_days INTEGER;
BEGIN
    IF start_date IS NULL THEN
        RETURN NULL;
    END IF;
    
    diff_seconds := EXTRACT(EPOCH FROM (NOW() - start_date))::BIGINT;
    diff_minutes := diff_seconds / 60;
    diff_hours := diff_minutes / 60;
    diff_days := diff_hours / 24;
    
    IF diff_days > 0 THEN
        RETURN diff_days || 'd ' || (diff_hours % 24) || 'h';
    ELSIF diff_hours > 0 THEN
        RETURN diff_hours || 'h ' || (diff_minutes % 60) || 'm';
    ELSE
        RETURN diff_minutes || 'm';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 3. FUNÇÕES DE SINCRONIZAÇÃO
-- =====================================================

-- Função principal de sincronização de tickets
CREATE OR REPLACE FUNCTION sync_tickets_from_glpi(
    p_instance VARCHAR(50),
    p_tickets JSONB
)
RETURNS TABLE(
    processed INTEGER,
    added INTEGER,
    updated INTEGER,
    removed INTEGER
) AS $$
DECLARE
    v_processed INTEGER := 0;
    v_added INTEGER := 0;
    v_updated INTEGER := 0;
    v_removed INTEGER := 0;
    v_ticket JSONB;
    v_ticket_id INTEGER;
    v_exists BOOLEAN;
BEGIN
    -- Marcar todos os tickets da instância como potencialmente removidos
    UPDATE tickets_cache 
    SET updated_at = NOW()
    WHERE instance = p_instance AND updated_at < NOW() - INTERVAL '1 minute';

    -- Processar cada ticket
    FOR v_ticket IN SELECT * FROM jsonb_array_elements(p_tickets)
    LOOP
        v_processed := v_processed + 1;
        v_ticket_id := (v_ticket->>'2')::INTEGER;

        -- Verificar se ticket já existe
        SELECT EXISTS(SELECT 1 FROM tickets_cache WHERE ticket_id = v_ticket_id AND instance = p_instance)
        INTO v_exists;

        IF v_exists THEN
            -- Atualizar ticket existente
            UPDATE tickets_cache SET
                title = v_ticket->>'1',
                entity = process_entity(v_ticket->>'80', p_instance),
                entity_full = v_ticket->>'80',
                category = v_ticket->>'7',
                root_category = get_root_category(v_ticket->>'7'),
                status_id = (v_ticket->>'12')::INTEGER,
                status_key = get_status_key((v_ticket->>'12')::INTEGER),
                status_name = get_status_name((v_ticket->>'12')::INTEGER),
                group_name = v_ticket->>'8',
                date_created = parse_glpi_date(v_ticket->>'15'),
                date_mod = parse_glpi_date(COALESCE(v_ticket->>'19', v_ticket->>'91', v_ticket->>'15')),
                due_date = parse_glpi_date(v_ticket->>'151'),
                is_sla_late = check_sla_late(parse_glpi_date(v_ticket->>'151')),
                raw_data = v_ticket,
                last_sync = NOW(),
                updated_at = NOW()
            WHERE ticket_id = v_ticket_id AND instance = p_instance;
            
            v_updated := v_updated + 1;
        ELSE
            -- Inserir novo ticket
            INSERT INTO tickets_cache (
                ticket_id, instance, title, entity, entity_full, category, root_category,
                status_id, status_key, status_name, group_name, date_created, date_mod,
                due_date, is_sla_late, raw_data, last_sync
            ) VALUES (
                v_ticket_id, p_instance, v_ticket->>'1', 
                process_entity(v_ticket->>'80', p_instance),
                v_ticket->>'80', v_ticket->>'7', get_root_category(v_ticket->>'7'),
                (v_ticket->>'12')::INTEGER,
                get_status_key((v_ticket->>'12')::INTEGER),
                get_status_name((v_ticket->>'12')::INTEGER),
                v_ticket->>'8',
                parse_glpi_date(v_ticket->>'15'),
                parse_glpi_date(COALESCE(v_ticket->>'19', v_ticket->>'91', v_ticket->>'15')),
                parse_glpi_date(v_ticket->>'151'),
                check_sla_late(parse_glpi_date(v_ticket->>'151')),
                v_ticket, NOW()
            );
            
            v_added := v_added + 1;
        END IF;
    END LOOP;

    -- Remover tickets que não foram atualizados (não existem mais no GLPI)
    DELETE FROM tickets_cache 
    WHERE instance = p_instance 
    AND updated_at < NOW() - INTERVAL '1 hour'
    AND last_sync < NOW() - INTERVAL '1 hour';

    GET DIAGNOSTICS v_removed = ROW_COUNT;

    RETURN QUERY SELECT v_processed, v_added, v_updated, v_removed;
END;
$$ LANGUAGE plpgsql;

-- Função para processar nome da entidade
CREATE OR REPLACE FUNCTION process_entity(entity_full TEXT, instance_name VARCHAR)
RETURNS TEXT AS $$
BEGIN
    IF entity_full IS NULL OR entity_full = '' THEN
        RETURN entity_full;
    END IF;
    
    IF instance_name = 'Peta' THEN
        RETURN REGEXP_REPLACE(entity_full, '^PETA GRUPO\s*>\s*', '', 'i');
    ELSIF instance_name = 'GMX' THEN
        RETURN REGEXP_REPLACE(entity_full, '^GMX\s*TECNOLOGIA\s*>\s*', '', 'i');
    END IF;
    
    RETURN entity_full;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função para converter data do GLPI
CREATE OR REPLACE FUNCTION parse_glpi_date(date_str TEXT)
RETURNS TIMESTAMPTZ AS $$
BEGIN
    IF date_str IS NULL OR date_str = '' THEN
        RETURN NULL;
    END IF;
    RETURN date_str::TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função para obter chave do status
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
        ELSE 'new'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função para obter nome do status
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
        ELSE 'Novo'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 4. FUNÇÕES DE CONSULTA (para as páginas)
-- =====================================================

-- Buscar tickets por instância
CREATE OR REPLACE FUNCTION get_tickets_by_instance(p_instance VARCHAR)
RETURNS TABLE(
    ticket_id INTEGER,
    title TEXT,
    entity TEXT,
    entity_full TEXT,
    category TEXT,
    root_category TEXT,
    status_id INTEGER,
    status_key VARCHAR,
    status_name TEXT,
    group_name TEXT,
    date_created TIMESTAMPTZ,
    date_mod TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    is_sla_late BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.ticket_id, t.title, t.entity, t.entity_full, t.category, t.root_category,
        t.status_id, t.status_key, t.status_name, t.group_name,
        t.date_created, t.date_mod, t.due_date, t.is_sla_late
    FROM tickets_cache t
    WHERE t.instance = p_instance
    ORDER BY t.date_mod DESC;
END;
$$ LANGUAGE plpgsql;

-- Buscar tickets ativos (não fechados/solucionados)
CREATE OR REPLACE FUNCTION get_active_tickets()
RETURNS TABLE(
    ticket_id INTEGER,
    instance VARCHAR,
    title TEXT,
    entity TEXT,
    category TEXT,
    status_key VARCHAR,
    status_name TEXT,
    group_name TEXT,
    date_created TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    is_sla_late BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.ticket_id, t.instance, t.title, t.entity, t.category,
        t.status_key, t.status_name, t.group_name,
        t.date_created, t.due_date, t.is_sla_late
    FROM tickets_cache t
    WHERE t.status_key NOT IN ('solved', 'closed')
    ORDER BY 
        CASE WHEN t.is_sla_late THEN 0 ELSE 1 END,
        t.due_date ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Buscar tickets em espera (por tempo de última atualização)
CREATE OR REPLACE FUNCTION get_waiting_tickets(p_hours INTEGER DEFAULT 24)
RETURNS TABLE(
    ticket_id INTEGER,
    instance VARCHAR,
    title TEXT,
    entity TEXT,
    category TEXT,
    status_key VARCHAR,
    status_name TEXT,
    group_name TEXT,
    date_created TIMESTAMPTZ,
    date_mod TIMESTAMPTZ,
    hours_since_update NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.ticket_id, t.instance, t.title, t.entity, t.category,
        t.status_key, t.status_name, t.group_name,
        t.date_created, t.date_mod,
        EXTRACT(EPOCH FROM (NOW() - t.date_mod)) / 3600 AS hours_since_update
    FROM tickets_cache t
    WHERE t.status_key NOT IN ('solved', 'closed')
    AND t.date_mod < NOW() - (p_hours || ' hours')::INTERVAL
    ORDER BY t.date_mod ASC;
END;
$$ LANGUAGE plpgsql;

-- Buscar tickets por período (para relatórios)
CREATE OR REPLACE FUNCTION get_tickets_by_period(
    p_date_type VARCHAR,  -- 'opening' ou 'update'
    p_start_date DATE,
    p_end_date DATE,
    p_instance VARCHAR DEFAULT NULL,
    p_entity VARCHAR DEFAULT NULL,
    p_status VARCHAR DEFAULT NULL
)
RETURNS TABLE(
    ticket_id INTEGER,
    instance VARCHAR,
    entity TEXT,
    category TEXT,
    status_key VARCHAR,
    status_name TEXT,
    group_name TEXT,
    date_created TIMESTAMPTZ,
    date_mod TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.ticket_id, t.instance, t.entity, t.category,
        t.status_key, t.status_name, t.group_name,
        t.date_created, t.date_mod
    FROM tickets_cache t
    WHERE 
        CASE p_date_type
            WHEN 'opening' THEN t.date_created
            ELSE t.date_mod
        END BETWEEN p_start_date AND p_end_date
    AND (p_instance IS NULL OR t.instance = p_instance)
    AND (p_entity IS NULL OR t.entity = p_entity)
    AND (p_status IS NULL OR t.status_key = p_status)
    ORDER BY 
        CASE p_date_type
            WHEN 'opening' THEN t.date_created
            ELSE t.date_mod
        END DESC;
END;
$$ LANGUAGE plpgsql;

-- Estatísticas por categoria (para dashboard)
CREATE OR REPLACE FUNCTION get_stats_by_category(p_instance VARCHAR DEFAULT NULL)
RETURNS TABLE(
    category TEXT,
    root_category TEXT,
    total INTEGER,
    peta_count INTEGER,
    gmx_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.category,
        t.root_category,
        COUNT(*)::INTEGER as total,
        COUNT(*) FILTER (WHERE t.instance = 'Peta')::INTEGER as peta_count,
        COUNT(*) FILTER (WHERE t.instance = 'GMX')::INTEGER as gmx_count
    FROM tickets_cache t
    WHERE p_instance IS NULL OR t.instance = p_instance
    GROUP BY t.category, t.root_category
    ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql;

-- Estatísticas por entidade (para dashboard)
CREATE OR REPLACE FUNCTION get_stats_by_entity(p_instance VARCHAR DEFAULT NULL)
RETURNS TABLE(
    entity TEXT,
    total INTEGER,
    peta_count INTEGER,
    gmx_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.entity,
        COUNT(*)::INTEGER as total,
        COUNT(*) FILTER (WHERE t.instance = 'Peta')::INTEGER as peta_count,
        COUNT(*) FILTER (WHERE t.instance = 'GMX')::INTEGER as gmx_count
    FROM tickets_cache t
    WHERE p_instance IS NULL OR t.instance = p_instance
    GROUP BY t.entity
    ORDER BY total DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Estatísticas por grupo responsável (para dashboard)
CREATE OR REPLACE FUNCTION get_stats_by_group(p_instance VARCHAR DEFAULT NULL)
RETURNS TABLE(
    group_name TEXT,
    total INTEGER,
    peta_count INTEGER,
    gmx_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.group_name,
        COUNT(*)::INTEGER as total,
        COUNT(*) FILTER (WHERE t.instance = 'Peta')::INTEGER as peta_count,
        COUNT(*) FILTER (WHERE t.instance = 'GMX')::INTEGER as gmx_count
    FROM tickets_cache t
    WHERE p_instance IS NULL OR t.instance = p_instance
    GROUP BY t.group_name
    ORDER BY total DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Tickets com SLA vencido (para dashboard)
CREATE OR REPLACE FUNCTION get_sla_overdue_tickets(p_instance VARCHAR DEFAULT NULL)
RETURNS TABLE(
    ticket_id INTEGER,
    instance VARCHAR,
    title TEXT,
    entity TEXT,
    category TEXT,
    status_key VARCHAR,
    status_name TEXT,
    due_date TIMESTAMPTZ,
    overdue_hours NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.ticket_id, t.instance, t.title, t.entity, t.category,
        t.status_key, t.status_name, t.due_date,
        EXTRACT(EPOCH FROM (NOW() - t.due_date)) / 3600 AS overdue_hours
    FROM tickets_cache t
    WHERE t.is_sla_late = TRUE
    AND (p_instance IS NULL OR t.instance = p_instance)
    ORDER BY t.due_date ASC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. NOTA SOBRE SINCRONIZAÇÃO AUTOMÁTICA
-- =====================================================
-- O Supabase usa Edge Functions ou webhooks para sincronização automática.
-- NÃO usa pg_cron diretamente.
--
-- OPÇÃO 1: Usar Edge Functions do Supabase
-- - Criar Edge Functions que chamam a API do GLPI
-- - Configurar schedule via Supabase Dashboard > Edge Functions > Schedules
--
-- OPÇÃO 2: Usar Vercel Cron (já configurado no projeto)
-- - O frontend já tem auto-reload configurado
-- - Adicionar lógica de sync no frontend
--
-- OPÇÃO 3: Usar webhook externo (GitHub Actions, etc)
-- - Configurar workflow que executa a sincronização
--
-- =====================================================
-- 6. FUNÇÃO AUXILIAR PARA SINCRONIZAÇÃO (a ser chamada externamente)
-- =====================================================

CREATE OR REPLACE FUNCTION sync_instance_tickets(p_instance VARCHAR)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_log_id UUID;
BEGIN
    -- Criar log de início
    INSERT INTO sync_logs (instance, status)
    VALUES (p_instance, 'running')
    RETURNING id INTO v_log_id;

    -- Chamar função de sincronização via API GLPI
    -- Esta função deve ser implementada no frontend e chamar esta função
    -- quando a sincronização for concluída
    
    UPDATE sync_logs SET
        finished_at = NOW(),
        status = 'completed'
    WHERE id = v_log_id;

    RETURN jsonb_build_object(
        'log_id', v_log_id,
        'instance', p_instance,
        'status', 'completed'
    );
EXCEPTION WHEN OTHERS THEN
    UPDATE sync_logs SET
        finished_at = NOW(),
        status = 'failed',
        error_message = SQLERRM
    WHERE id = v_log_id;

    RETURN jsonb_build_object(
        'log_id', v_log_id,
        'instance', p_instance,
        'status', 'failed',
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. FUNÇÃO PARA REGISTRAR RESULTADO DE SINCRONIZAÇÃO
-- =====================================================

CREATE OR REPLACE FUNCTION register_sync_result(
    p_instance VARCHAR,
    p_tickets JSONB,
    p_status VARCHAR,
    p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_processed INTEGER := 0;
    v_added INTEGER := 0;
    v_updated INTEGER := 0;
    v_removed INTEGER := 0;
BEGIN
    IF p_status = 'success' THEN
        SELECT * FROM sync_tickets_from_glpi(p_instance, p_tickets)
        INTO v_processed, v_added, v_updated, v_removed;

        UPDATE sync_control SET
            last_sync = NOW(),
            status = 'success',
            tickets_count = v_processed,
            error_message = NULL,
            updated_at = NOW()
        WHERE instance = p_instance;

        INSERT INTO sync_logs (instance, status, finished_at, tickets_processed, tickets_added, tickets_updated, tickets_removed)
        VALUES (p_instance, 'success', NOW(), v_processed, v_added, v_updated, v_removed);
    ELSE
        UPDATE sync_control SET
            status = 'failed',
            error_message = p_error,
            updated_at = NOW()
        WHERE instance = p_instance;

        INSERT INTO sync_logs (instance, status, finished_at, error_message)
        VALUES (p_instance, 'failed', NOW(), p_error);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. VIEWS PRONTAS PARA USO
-- =====================================================

-- View de tickets ativos com informações completas
CREATE OR REPLACE VIEW v_active_tickets AS
SELECT 
    ticket_id,
    instance,
    title,
    entity,
    category,
    root_category,
    status_key,
    status_name,
    group_name,
    date_created,
    date_mod,
    due_date,
    is_sla_late,
    format_pending_duration(date_mod) as waiting_time
FROM tickets_cache
WHERE status_key NOT IN ('solved', 'closed')
ORDER BY 
    CASE WHEN is_sla_late THEN 0 ELSE 1 END,
    due_date ASC NULLS LAST;

-- View de métricas por instância
CREATE OR REPLACE VIEW v_instance_metrics AS
SELECT 
    instance,
    COUNT(*) FILTER (WHERE status_key = 'new') as novos,
    COUNT(*) FILTER (WHERE status_key = 'processing') as em_atendimento,
    COUNT(*) FILTER (WHERE status_key = 'pending') as pendentes,
    COUNT(*) FILTER (WHERE status_key = 'solved') as solucionados,
    COUNT(*) FILTER (WHERE status_key = 'closed') as fechados,
    COUNT(*) FILTER (WHERE is_sla_late = TRUE) as sla_vencido,
    COUNT(*) as total
FROM tickets_cache
GROUP BY instance;

-- View de últimos_SYNC
CREATE OR REPLACE VIEW v_sync_status AS
SELECT 
    instance,
    last_sync,
    status,
    tickets_count,
    error_message,
    EXTRACT(EPOCH FROM (NOW() - last_sync))/3600 as hours_since_sync
FROM sync_control
ORDER BY last_sync DESC;

-- =====================================================
-- 9. POLÍTICAS DE SEGURANÇA (RLS)
-- =====================================================

-- Habilitar RLS nas tabelas
ALTER TABLE tickets_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_control ENABLE ROW LEVEL SECURITY;

-- Políticas públicas para leitura (supabase anon key)
CREATE POLICY "Allow read tickets_cache" ON tickets_cache
    FOR SELECT USING (true);

CREATE POLICY "Allow read sync_logs" ON sync_logs
    FOR SELECT USING (true);

CREATE POLICY "Allow read sync_control" ON sync_control
    FOR SELECT USING (true);

-- Políticas para escrita (service role ou funções específicas)
CREATE POLICY "Allow service role insert tickets_cache" ON tickets_cache
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service role update tickets_cache" ON tickets_cache
    FOR UPDATE USING (true);

CREATE POLICY "Allow service role delete tickets_cache" ON tickets_cache
    FOR DELETE USING (true);

-- =====================================================
-- 10. INICIALIZAÇÃO
-- =====================================================

-- Inserir registros de controle para as instâncias
INSERT INTO sync_control (instance, status) 
VALUES ('Peta', 'pending'), ('GMX', 'pending')
ON CONFLICT (instance) DO NOTHING;

-- =====================================================
-- INSTRUÇÕES DE CONFIGURAÇÃO
-- =====================================================

-- 1. Execute este script completo no Supabase SQL Editor

-- 2. Para sincronização automática, você tem 3 opções:

--    OPÇÃO A: Supabase Edge Functions (Recomendado)
--    ------------------------------------------
--    a) Criar Edge Function em supabase/functions/sync-tickets/index.ts
--    b) Configurar schedule no Supabase Dashboard:
--       Edge Functions > Schedules > New Schedule
--       - Function: sync-tickets
--       - Schedule: Every 3 hours
--
--    OPÇÃO B: Vercel Cron (já integrado ao projeto)
--    ---------------------------------------------
--    Adicionar arquivo vercel.json com:
--    {
--      "crons": [{
--        "path": "/api/sync",
--        "schedule": "0 */3 * * *"
--      }]
--    }
--
--    OPÇÃO C: GitHub Actions
--    -----------------------
--    Criar .github/workflows/sync.yml com schedule
--
-- 3. Para testar a sincronização manualmente:
--    SELECT register_sync_result('Peta', '[{"2": 123}]'::jsonb, 'success');
--    SELECT register_sync_result('GMX', '[{"2": 456}]'::jsonb, 'success');

-- =====================================================
-- FIM DO SCRIPT
-- =====================================================
