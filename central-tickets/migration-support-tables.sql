-- Migration: Support tables for sync infrastructure
-- Execute no Supabase SQL Editor ANTES de fazer o redeploy da Edge Function

-- ── sync_control: rastreia estado do sync por instância ──────────────────────

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

-- ── sync_logs: histórico append-only de cada execução ────────────────────────

CREATE TABLE IF NOT EXISTS sync_logs (
    id                BIGSERIAL PRIMARY KEY,
    instance          TEXT,
    finished_at       TIMESTAMPTZ,
    status            TEXT,
    tickets_processed INTEGER DEFAULT 0,
    error_message     TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Estado inicial
INSERT INTO sync_control (instance, status)
VALUES ('PETA', 'pending'), ('GMX', 'pending')
ON CONFLICT (instance) DO NOTHING;

-- ── Verificação ───────────────────────────────────────────────────────────────

SELECT * FROM sync_control;
