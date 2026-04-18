-- Migration v5: Add extended ticket fields from GLPI webhook payload
-- Run this in the Supabase SQL Editor
-- Note: date_solved and solution were already added in migration-v4.sql

-- ── New text / identity columns ──────────────────────────────────────────────

ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS content              TEXT;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS requester            TEXT;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS requester_id         INTEGER DEFAULT 0;

-- ── Numeric priority / impact fields ────────────────────────────────────────

ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS urgency              INTEGER DEFAULT 3;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS impact               INTEGER DEFAULT 3;

-- ── Date fields ──────────────────────────────────────────────────────────────

ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS date_close           TIMESTAMPTZ;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS take_into_account_date TIMESTAMPTZ;

-- ── Duration / time tracking (seconds) ──────────────────────────────────────

ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS waiting_duration     INTEGER DEFAULT 0;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS resolution_duration  INTEGER DEFAULT 0;

-- ── SLA metadata ─────────────────────────────────────────────────────────────

ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS sla_ttr_name        TEXT;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS sla_tto_name        TEXT;

-- ── Validation / approval status ─────────────────────────────────────────────
-- 1=None, 2=Waiting, 3=Accepted, 4=Refused, 5=Closed

ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS global_validation   INTEGER DEFAULT 1;

-- ── Location and channel ─────────────────────────────────────────────────────

ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS location            TEXT;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS request_type        TEXT;

-- ── Soft-delete flag ─────────────────────────────────────────────────────────

ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS is_deleted          BOOLEAN DEFAULT false;

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tickets_cache_urgency
    ON tickets_cache(urgency);

CREATE INDEX IF NOT EXISTS idx_tickets_cache_requester
    ON tickets_cache(requester);

CREATE INDEX IF NOT EXISTS idx_tickets_cache_location
    ON tickets_cache(location);

-- Partial index: only active (non-deleted) rows, covering the most common queries
CREATE INDEX IF NOT EXISTS idx_tickets_cache_active
    ON tickets_cache(instance, status_key)
    WHERE is_deleted = false;

-- ── Verify all v5 columns exist ──────────────────────────────────────────────

SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'tickets_cache'
  AND column_name IN (
      'content',
      'requester',
      'requester_id',
      'urgency',
      'impact',
      'date_close',
      'take_into_account_date',
      'waiting_duration',
      'resolution_duration',
      'sla_ttr_name',
      'sla_tto_name',
      'global_validation',
      'location',
      'request_type',
      'is_deleted'
  )
ORDER BY column_name;
