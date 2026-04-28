-- Add request_source column to store the origin of the ticket (phone, email, helpdesk portal, etc.)
-- This corresponds to GLPI search field 13 (Request source)
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS request_source TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_tickets_cache_request_source ON tickets_cache(request_source);
