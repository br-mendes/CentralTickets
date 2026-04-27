-- Add FK ID columns to tickets_cache so the API route enrichment layer can
-- join against glpi_entities, glpi_groups, glpi_users, and glpi_request_types.
-- Required before deploying sync-gmx / sync-peta functions that write these fields.

ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS entity_id       INTEGER DEFAULT 0;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS group_id        INTEGER DEFAULT 0;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS request_type_id INTEGER DEFAULT 0;

-- requester_id already exists (was always 0); backfill index for lookup performance
CREATE INDEX IF NOT EXISTS idx_tickets_cache_entity_id       ON tickets_cache(entity_id)       WHERE entity_id > 0;
CREATE INDEX IF NOT EXISTS idx_tickets_cache_group_id        ON tickets_cache(group_id)        WHERE group_id > 0;
CREATE INDEX IF NOT EXISTS idx_tickets_cache_requester_id    ON tickets_cache(requester_id)    WHERE requester_id > 0;
CREATE INDEX IF NOT EXISTS idx_tickets_cache_request_type_id ON tickets_cache(request_type_id) WHERE request_type_id > 0;
