-- Migration v3: Add type_id, priority_id and ensure all required columns exist
-- Run this in the Supabase SQL editor

-- Add missing columns (safe with IF NOT EXISTS)
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS type_id      INTEGER DEFAULT 2;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS priority_id  INTEGER DEFAULT 3;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS is_overdue_first   BOOLEAN DEFAULT false;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS is_overdue_resolve BOOLEAN DEFAULT false;

-- Add index for type_id filter (Incidentes page)
CREATE INDEX IF NOT EXISTS idx_tickets_cache_type_id ON tickets_cache(type_id);

-- Add index for status_key (Monitor.Tickets filter)
CREATE INDEX IF NOT EXISTS idx_tickets_cache_status_key ON tickets_cache(status_key);

-- Add index for instance + status_key (common combined filter)
CREATE INDEX IF NOT EXISTS idx_tickets_cache_instance_status ON tickets_cache(instance, status_key);

-- Backfill type_id=2 (Request) for existing rows that have no type set
UPDATE tickets_cache SET type_id = 2 WHERE type_id IS NULL;

-- Backfill priority_id=3 (Medium) for existing rows
UPDATE tickets_cache SET priority_id = 3 WHERE priority_id IS NULL;

-- Verify
SELECT
  COUNT(*) AS total,
  COUNT(type_id) AS with_type_id,
  COUNT(priority_id) AS with_priority_id,
  COUNT(is_overdue_first) AS with_overdue_first,
  COUNT(is_overdue_resolve) AS with_overdue_resolve
FROM tickets_cache;
