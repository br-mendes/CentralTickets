-- Check columns in tickets_cache table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickets_cache'
ORDER BY ordinal_position;