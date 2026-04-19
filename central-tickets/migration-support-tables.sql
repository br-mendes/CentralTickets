-- Tabelas de controle de sync
-- Execute no Supabase SQL Editor ANTES de fazer o redeploy da Edge Function
-- Após executar este script, a Edge Function vai auto-iniciar o full sync
-- na próxima execução do cron (não precisa de nenhuma chamada manual)

-- ── sync_control: estado de sync por instância ────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_control (
    instance        TEXT PRIMARY KEY,
    last_sync       TIMESTAMPTZ,
    status          TEXT DEFAULT 'pending',
    last_page       INTEGER DEFAULT 0,
    total_pages     INTEGER DEFAULT 0,
    tickets_count   INTEGER DEFAULT 0,
    error_message   TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── sync_logs: histórico de execuções ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_logs (
    id                BIGSERIAL PRIMARY KEY,
    instance          TEXT,
    finished_at       TIMESTAMPTZ,
    status            TEXT,
    tickets_processed INTEGER DEFAULT 0,
    error_message     TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Estado inicial: força full sync na próxima execução do cron ───────────────

INSERT INTO sync_control (instance, status)
VALUES ('PETA', 'pending'), ('GMX', 'pending')
ON CONFLICT (instance) DO UPDATE SET status = 'pending', updated_at = NOW();

-- ── Verificação ───────────────────────────────────────────────────────────────

SELECT instance, status, last_sync, tickets_count FROM sync_control ORDER BY instance;
