# Guia de Deployment

## Pré-Requisitos

✅ Supabase Project criado
✅ CLI do Supabase instalado (`npm install -g supabase`)
✅ Git configurado
✅ Deno (opcional, para testes locais)

## Passo 1: Preparar o Ambiente

### 1.1 Instalar Supabase CLI

```bash
# macOS/Linux
brew install supabase/tap/supabase

# Windows (com Chocolatey)
choco install supabase

# Ou com npm/yarn
npm install -g supabase
```

### 1.2 Fazer Login

```bash
supabase login
```

Você será redirecionado para o navegador para autenticar.

### 1.3 Link com seu Projeto

```bash
cd /caminho/para/central-tickets

supabase link --project-ref seu-projeto-id
```

Para encontrar seu `project-ref`:
1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto
3. Copie o ID na URL: `https://supabase.com/dashboard/project/[ID]`

## Passo 2: Configurar Variáveis de Ambiente

### 2.1 Criar arquivo `.env.local`

```bash
touch supabase/.env.local
```

### 2.2 Adicionar variáveis (nunca commitar este arquivo)

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=seu-service-role-key-secreto
```

**Como obter as chaves:**

1. Acesse `Settings` → `API` no dashboard
2. Copie `URL` para `SUPABASE_URL`
3. Copie `service_role` key (a maior) para `SUPABASE_SERVICE_ROLE_KEY`

⚠️ **SEGURANÇA:** Nunca commitar `.env.local` ou `.env.secrets`!

### 2.3 Adicionar ao `.gitignore`

```bash
echo "supabase/.env.local" >> .gitignore
echo "supabase/.env.secrets" >> .gitignore
```

## Passo 3: Preparar a Edge Function

### 3.1 Estrutura de Arquivos

```
supabase/
├── functions/
│   └── sync-glpi-tickets/
│       ├── index.ts              ✅ Função principal
│       ├── types.ts              ✅ Tipos TypeScript
│       ├── example.ts            ✅ Exemplos de uso
│       ├── test.ts               ✅ Suite de testes
│       ├── deno.json             ✅ Configuração Deno
│       ├── README.md             ✅ Documentação
│       ├── MAPPING.md            ✅ Mapeamento de campos
│       └── DEPLOYMENT.md         ✅ Este arquivo
```

### 3.2 Validar a Função

```bash
# Testar sintaxe
deno run --allow-net supabase/functions/sync-glpi-tickets/index.ts

# Ou com Supabase
supabase functions serve sync-glpi-tickets
```

## Passo 4: Deploy

### 4.1 Deploy Local (Teste)

```bash
supabase start

# Em outro terminal
supabase functions serve
```

Isso inicia um servidor local em `http://localhost:54321`

### 4.2 Deploy para Produção

```bash
# Fazer login se necessário
supabase login

# Deploy
supabase functions deploy sync-glpi-tickets

# Com output detalhado
supabase functions deploy sync-glpi-tickets --verbose
```

### 4.3 Configurar Secrets em Produção

```bash
# Adicionar secrets
supabase secrets set SUPABASE_URL=https://seu-projeto.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=seu-service-role-key

# Listar secrets (masked)
supabase secrets list
```

## Passo 5: Configurar Tabelas no Banco

### 5.1 Criar Tabelas

Execute o seguinte SQL no Supabase SQL Editor:

```sql
-- Tabela de tickets em cache
CREATE TABLE IF NOT EXISTS public.tickets_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id integer NOT NULL,
  instance character varying NOT NULL CHECK (instance::text = ANY (ARRAY['PETA'::character varying::text, 'GMX'::character varying::text])),
  title text,
  entity text,
  entity_full text,
  category text,
  root_category text,
  status_id integer,
  status_key character varying,
  status_name text,
  group_name text,
  date_created timestamp with time zone,
  date_mod timestamp with time zone,
  due_date timestamp with time zone,
  is_sla_late boolean DEFAULT false,
  sla_percentage_first numeric,
  sla_percentage_resolve numeric,
  raw_data jsonb,
  last_sync timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  technician text,
  time_to_own timestamp with time zone,
  time_to_resolve timestamp with time zone,
  is_overdue_first boolean DEFAULT false,
  is_overdue_resolve boolean DEFAULT false,
  technician_id integer DEFAULT 0,
  priority_id integer DEFAULT 1,
  priority text DEFAULT '1-Baixa'::text,
  urgency integer DEFAULT 3,
  solution_content text,
  date_solved timestamp with time zone,
  type_id integer DEFAULT 2,
  solution text,
  content text,
  requester text,
  requester_id integer DEFAULT 0,
  impact integer DEFAULT 3,
  date_close timestamp with time zone,
  take_into_account_date timestamp with time zone,
  waiting_duration integer DEFAULT 0,
  resolution_duration integer DEFAULT 0,
  sla_ttr_name text,
  sla_tto_name text,
  global_validation integer DEFAULT 1,
  location text,
  request_type text,
  is_deleted boolean DEFAULT false,
  solution_date timestamp with time zone,
  category_name text,
  entity_name text,
  group_id bigint,
  entity_id integer DEFAULT 0,
  request_type_id integer DEFAULT 0,
  request_source text DEFAULT ''::text,
  requester_fullname text,
  requester_email text,
  technician_email text,
  CONSTRAINT tickets_cache_pkey PRIMARY KEY (ticket_id, instance)
);

-- Tabela de controle de sincronização
CREATE TABLE IF NOT EXISTS public.sync_control (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  instance character varying NOT NULL UNIQUE,
  last_sync timestamp with time zone,
  status character varying DEFAULT 'pending'::character varying,
  tickets_count integer DEFAULT 0,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_page integer DEFAULT 0,
  total_pages integer DEFAULT 0,
  last_id bigint,
  CONSTRAINT sync_control_pkey PRIMARY KEY (instance)
);

-- Tabela de logs de sincronização
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  instance character varying,
  started_at timestamp with time zone DEFAULT now(),
  finished_at timestamp with time zone,
  status character varying,
  tickets_processed integer DEFAULT 0,
  tickets_added integer DEFAULT 0,
  tickets_updated integer DEFAULT 0,
  tickets_removed integer DEFAULT 0,
  error_message text,
  CONSTRAINT sync_logs_pkey PRIMARY KEY (id)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_tickets_cache_instance ON public.tickets_cache(instance);
CREATE INDEX IF NOT EXISTS idx_tickets_cache_date_mod ON public.tickets_cache(date_mod DESC);
CREATE INDEX IF NOT EXISTS idx_sync_control_instance ON public.sync_control(instance);
CREATE INDEX IF NOT EXISTS idx_sync_logs_instance ON public.sync_logs(instance);
```

### 5.2 Verificar Tabelas

```sql
-- Verificar se tabelas foram criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('tickets_cache', 'sync_control', 'sync_logs');
```

## Passo 6: Testar a Function

### 6.1 Teste com cURL

```bash
curl -X POST https://seu-projeto.supabase.co/functions/v1/sync-glpi-tickets \
  -H "Authorization: Bearer seu-anon-key" \
  -H "Content-Type: application/json" \
  -d '{
    "instance": "PETA",
    "all_tickets": [
      {
        "ticket_id": 1,
        "instance": "PETA",
        "title": "Test",
        "status_id": 1,
        "status_name": "Novo",
        "priority_id": 1,
        "urgency": 1,
        "impact": 1,
        "date_created": "2026-04-30T10:00:00Z",
        "date_mod": "2026-04-30T10:00:00Z",
        "is_deleted": false,
        "entity": null,
        "entity_full": null,
        "entity_id": 0,
        "entity_name": null,
        "category": null,
        "category_name": null,
        "root_category": null,
        "technician": null,
        "technician_id": 0,
        "technician_email": null,
        "requester": null,
        "requester_id": 0,
        "requester_fullname": null,
        "requester_email": null,
        "group_name": null,
        "group_id": 0,
        "request_type": null,
        "request_type_id": 0,
        "request_source": null,
        "status_key": null,
        "priority": "1-Baixa",
        "type_id": 1,
        "date_solved": null,
        "date_close": null,
        "due_date": null,
        "take_into_account_date": null,
        "is_sla_late": false,
        "is_overdue_first": false,
        "is_overdue_resolve": false,
        "sla_percentage_first": null,
        "sla_percentage_resolve": null,
        "sla_ttr_name": null,
        "sla_tto_name": null,
        "solution": null,
        "solution_content": null,
        "solution_date": null,
        "location": null,
        "content": null,
        "waiting_duration": 0,
        "resolution_duration": 0,
        "global_validation": 1
      }
    ],
    "timestamp": "2026-04-30T10:00:00Z"
  }'
```

### 6.2 Teste com Deno

```bash
deno run --allow-net supabase/functions/sync-glpi-tickets/test.ts
```

### 6.3 Verificar Logs

```bash
# Listar as últimas execuções
supabase functions list

# Ver logs em tempo real
supabase functions download sync-glpi-tickets

# Ou no dashboard
# Functions → sync-glpi-tickets → Logs
```

## Passo 7: Integração com a Aplicação

### 7.1 Cliente JavaScript/TypeScript

```typescript
import { SyncPayload, SyncLogResponse } from './types';

const syncGlpi = async (instance: 'PETA' | 'GMX', tickets: any[]) => {
  const payload: SyncPayload = {
    instance,
    all_tickets: tickets,
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(
    `${process.env.VITE_SUPABASE_URL}/functions/v1/sync-glpi-tickets`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const result: SyncLogResponse = await response.json();
  return result;
};

// Usar
const result = await syncGlpi('PETA', tickets);
console.log(`${result.tickets_added} novos, ${result.tickets_updated} atualizados`);
```

### 7.2 Webhook ou Job Agendado

```typescript
// Executar sincronização a cada 5 minutos
setInterval(async () => {
  const tickets = await fetchFromGlpiApi('PETA');
  await syncGlpi('PETA', tickets);
  
  const ticketsGmx = await fetchFromGlpiApi('GMX');
  await syncGlpi('GMX', ticketsGmx);
}, 5 * 60 * 1000);
```

## Passo 8: Monitoramento e Manutenção

### 8.1 Verificar Status da Sincronização

```sql
-- Última sincronização por instância
SELECT 
  instance,
  last_sync,
  status,
  tickets_count,
  error_message,
  updated_at
FROM sync_control
ORDER BY updated_at DESC;
```

### 8.2 Histórico de Sincronizações

```sql
-- Últimas 10 sincronizações
SELECT 
  instance,
  started_at,
  finished_at,
  status,
  tickets_processed,
  tickets_added,
  tickets_updated,
  EXTRACT(EPOCH FROM (finished_at - started_at)) as duracao_segundos
FROM sync_logs
ORDER BY started_at DESC
LIMIT 10;
```

### 8.3 Detectar Problemas

```sql
-- Sincronizações com erro
SELECT 
  instance,
  started_at,
  status,
  tickets_processed,
  error_message
FROM sync_logs
WHERE status != 'completed'
ORDER BY started_at DESC
LIMIT 5;

-- Instâncias sem sincronização recente
SELECT 
  instance,
  last_sync,
  NOW() - last_sync as tempo_sem_sync
FROM sync_control
WHERE last_sync < NOW() - INTERVAL '1 hour'
ORDER BY last_sync DESC;
```

## Troubleshooting

### Problema: "Function not found"

**Solução:**
```bash
# Verificar se foi deployada
supabase functions list

# Re-deploy
supabase functions deploy sync-glpi-tickets --verbose
```

### Problema: "Service Role Key missing"

**Solução:**
```bash
# Configurar secrets
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sua-chave

# Verificar
supabase secrets list
```

### Problema: "Permission denied"

**Solução:**
- Verificar se a chave é `service_role` (não `anon`)
- Verificar RLS policies na tabela `tickets_cache`
- Executar:
  ```sql
  ALTER TABLE tickets_cache DISABLE ROW LEVEL SECURITY;
  ```

### Problema: "Connection timeout"

**Solução:**
- Verificar URL do Supabase
- Verificar conectividade de rede
- Aumentar timeout em cliente

### Problema: Sincronização lenta

**Solução:**
- Reduzir tamanho do lote (< 1000 tickets)
- Aumentar `timeout` no Deno (padrão: 60s)
- Verificar índices criados
- Verificar carga do BD

## Rollback

Se algo der errado:

```bash
# Ver versão anterior
supabase functions list

# Se precisar voltar (redeploiar versão anterior)
supabase functions delete sync-glpi-tickets
supabase functions deploy sync-glpi-tickets
```

## Próximos Passos

- [ ] Configurar monitoramento/alertas
- [ ] Criar dashboard de sincronização
- [ ] Configurar job agendado (cron)
- [ ] Backup automático dos dados
- [ ] Documentação de API publica

## Documentação Adicional

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Deno Documentation](https://deno.land/manual)
- [TypeScript Setup](https://supabase.com/docs/guides/functions/typescript)

## Support

Para dúvidas ou problemas:
1. Verificar logs: `supabase functions list`
2. Consultar documentação: Veja README.md e MAPPING.md
3. Contatar time de desenvolvimento
