-- Performance indexes for tickets_cache table
-- Run this in Supabase SQL Editor to improve query performance

-- Drop existing indexes if they exist (for recreate)
DROP INDEX IF EXISTS idx_tickets_cache_date_mod_desc;
DROP INDEX IF EXISTS idx_tickets_cache_instance_status;
DROP INDEX IF EXISTS idx_tickets_cache_instance_sla;
DROP INDEX IF EXISTS idx_tickets_cache_status_key;
DROP INDEX IF EXISTS idx_tickets_cache_technician;

-- Main index for dashboard queries (date_mod desc + instance filter)
CREATE INDEX idx_tickets_cache_date_mod_desc 
ON tickets_cache(date_mod DESC);

-- Composite index for instance + status queries
CREATE INDEX idx_tickets_cache_instance_status 
ON tickets_cache(instance, status_key);

-- Composite index for instance + SLA queries
CREATE INDEX idx_tickets_cache_instance_sla 
ON tickets_cache(instance, is_sla_late);

-- Index for status filtering
CREATE INDEX idx_tickets_cache_status_key 
ON tickets_cache(status_key);

-- Index for technician lookups
CREATE INDEX idx_tickets_cache_technician 
ON tickets_cache(technician) 
WHERE technician IS NOT NULL AND technician != '';

-- Verify indexes were created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'tickets_cache'
ORDER BY indexname;