# Configuração do Agendamento de Sincronização

## Opção 1: Via Dashboard do Supabase (Recomendado)

1. Acesse https://supabase.com/dashboard
2. Selecione seu projeto: **zyigzxkwnltudojumhpq**
3. Vá em **Edge Functions** > **Schedules**
4. Clique em **New Schedule**
5. Configure:
   - **Function**: `sync-tickets`
   - **Cron**: `0 */3 * * *`
   - **Description**: Sync tickets from GLPI every 3 hours
6. Clique em **Create Schedule**

## Opção 2: Via CLI do Supabase

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Agendar a função
supabase functions schedule sync-tickets --cron "0 */3 * * *"
```

## Opção 3: Via API (usando token)

```bash
curl -X POST "https://api.supabase.com/v1/projects/zyigzxkwnltudojumhpq/functions/schedules" \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "function_name": "sync-tickets",
    "schedule": "0 */3 * * *"
  }'
```

## Verificar Agendamento

```bash
supabase functions schedule list
```

## Testar a Função Manualmente

```bash
curl -L -X POST 'https://zyigzxkwnltudojumhpq.supabase.co/functions/v1/sync-tickets' \
  -H 'Authorization: Bearer SEU_ANON_KEY' \
  -H 'apikey: SEU_ANON_KEY' \
  -H 'Content-Type: application/json'
```
