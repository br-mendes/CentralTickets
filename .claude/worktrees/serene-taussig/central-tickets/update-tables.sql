-- Script para adicionar coluna technician_name na tabela tickets_cache
-- Executar no Supabase SQL Editor

-- Adicionar coluna technician_name se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tickets_cache' AND column_name = 'technician_name'
    ) THEN
        ALTER TABLE tickets_cache ADD COLUMN technician_name TEXT;
        COMMENT ON COLUMN tickets_cache.technician_name IS 'Nome do técnico atribuído ao ticket';
    END IF;
END $$;

-- Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_tickets_cache_technician_name ON tickets_cache(technician_name) WHERE technician_name IS NOT NULL;

-- Criar tabela de cache de usuários se não existir
CREATE TABLE IF NOT EXISTS user_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    name TEXT,
    firstname TEXT,
    realname TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(instance, user_id)
);

-- Criar índice para busca rápida de usuários
CREATE INDEX IF NOT EXISTS idx_user_cache_instance_user ON user_cache(instance, user_id);

-- Habilitar RLS na tabela user_cache
ALTER TABLE user_cache ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública
CREATE POLICY "Allow read user_cache" ON user_cache FOR SELECT USING (true);

-- Política de insert/update
CREATE POLICY "Allow service role user_cache" ON user_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update user_cache" ON user_cache FOR UPDATE USING (true);

-- Verificar se as colunas foram adicionadas
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickets_cache' 
AND column_name IN ('technician', 'technician_name')
ORDER BY column_name;