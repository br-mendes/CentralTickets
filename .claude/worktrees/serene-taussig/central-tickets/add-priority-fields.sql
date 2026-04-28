-- Migration: Add priority fields to tickets_cache table
-- Run this in Supabase SQL Editor to add priority support

-- Add priority columns
ALTER TABLE tickets_cache 
ADD COLUMN IF NOT EXISTS priority_id INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT '1-Baixa',
ADD COLUMN IF NOT EXISTS urgency BOOLEAN DEFAULT false;

-- Create index on priority for faster filtering
CREATE INDEX IF NOT EXISTS idx_tickets_cache_priority ON tickets_cache(priority_id);

-- Add urgency index
CREATE INDEX IF NOT EXISTS idx_tickets_cache_urgency ON tickets_cache(urgency);

-- Verify columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'tickets_cache' 
AND column_name IN ('priority_id', 'priority', 'urgency');