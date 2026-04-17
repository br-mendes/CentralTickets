-- Migration v4: Add date_solved and solution columns
-- Run this in the Supabase SQL editor

ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS date_solved TIMESTAMPTZ;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS solution    TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_cache_date_solved ON tickets_cache(date_solved);

-- Verify
SELECT
  COUNT(*) AS total,
  COUNT(date_solved) AS with_date_solved,
  COUNT(solution)    AS with_solution
FROM tickets_cache;
