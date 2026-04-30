# Edge Function: Sincronização GLPI → Supabase

## 📌 Resumo

Nova edge function em `supabase/functions/sync-glpi-tickets/` para sincronização incremental de tickets GLPI (PETA e GMX).

### ✨ Características

✅ **Detecção incremental de mudanças** (30+ campos monitorados)
✅ **Multi-instância** (PETA + GMX em uma única function)
✅ **Logs detalhados** com timestamps
✅ **Sem truncamento** de dados
✅ **Mapeamento automático** JSON GLPI → Schema Supabase
✅ **Tratamento de erros** granular por ticket
✅ **Preservação de dados** - JSON original em raw_data

### 📊 Uso Rápido

```typescript
const payload = {
  instance: "PETA",
  all_tickets: [...],  // Array de tickets da API GLPI
  timestamp: new Date().toISOString()
};

const result = await fetch(
  'https://seu-projeto.supabase.co/functions/v1/sync-glpi-tickets',
  {
    method: 'POST',
    headers: { 
      'Authorization': 'Bearer sua-chave',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }
).then(r => r.json());

console.log(`✅ ${result.tickets_added} novos`);
console.log(`♻️ ${result.tickets_updated} atualizados`);
console.log(`📊 ${result.changes_detected.length} mudanças`);
```

### 📤 Resposta

```json
{
  "status": "completed",
  "tickets_processed": 20,
  "tickets_added": 3,
  "tickets_updated": 15,
  "changes_detected": [
    {
      "ticket_id": 10830,
      "changed_fields": ["status_name", "priority_id"],
      "old_values": {"status_name": "Novo", "priority_id": 2},
      "new_values": {"status_name": "Em atendimento", "priority_id": 1}
    }
  ],
  "errors": [],
  "details": [
    "[2026-04-30T10:40:07.695Z] 🚀 Iniciando...",
    "[2026-04-30T10:40:08.123Z] ✅ Novo ticket #10830"
  ]
}
```

## 🚀 Deploy

```bash
# Configurar secrets no Supabase
supabase secrets set SUPABASE_URL=https://seu-projeto.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sua-chave-secreta

# Deploy
supabase functions deploy sync-glpi-tickets

# Testar
curl -X POST https://seu-projeto.supabase.co/functions/v1/sync-glpi-tickets \
  -H "Authorization: Bearer sua-chave" \
  -H "Content-Type: application/json" \
  -d '{"instance": "PETA", "all_tickets": [], "timestamp": "2026-04-30T10:00:00Z"}'
```

## 📊 Campos Mapeados

40+ campos da API GLPI são mapeados automaticamente:

| Categoria | Campos |
|-----------|--------|
| **Identificadores** | ticket_id, instance |
| **Básicos** | title, content, entity, category, root_category |
| **Status** | status_id, status_name, priority_id, urgency, impact |
| **Atores** | technician, technician_id, requester, requester_id, group_name, group_id |
| **Datas** | date_created, date_mod, date_solved, date_close, due_date |
| **SLA** | is_sla_late, sla_percentage_first, sla_percentage_resolve, is_overdue_first, is_overdue_resolve |
| **Outros** | request_type, solution, location, waiting_duration, resolution_duration, is_deleted |

Veja `index.ts` em `normalizeData()` para mapeamento completo.

## 🔄 Detecção de Mudanças

A function automaticamente detecta campos que mudaram:

```
Primeira sincronização:
  Ticket #10830 → NOVO (todos os campos registrados)

Segunda sincronização (mesmo ticket, dados atualizados):
  Ticket #10830 → status mudou: "Novo" → "Em atendimento"
               → prioridade mudou: 2 → 1
  Resultado: ATUALIZADO (apenas 2 campos changed)
```

**30 campos monitorados para mudanças:**
title, content, entity, category, technician, technician_id, requester, requester_id, group_name, group_id, request_type, status_id, status_key, status_name, priority_id, priority, type_id, urgency, impact, date_mod, date_solved, date_close, due_date, is_sla_late, is_overdue_first, is_overdue_resolve, sla_percentage_first, sla_percentage_resolve, solution, is_deleted

## 📝 Logs Estruturados

Cada sincronização gera logs com emojis e timestamps:

```
🚀 Iniciando sincronização para instância: PETA
📊 Total de tickets recebidos: 20
⏱️ Última sincronização: 2026-04-30T09:00:00Z
⏳ Processados 10/20 tickets
✅ Novo ticket adicionado: #10830
♻️ Ticket atualizado: #10831
🔄 Mudanças detectadas em #10832: status_name, priority_id, date_mod
⚠️ Aviso: Falha no processamento
❌ Erro: Instância inconsistente
✨ Sincronização concluída: 3 adicionados, 15 atualizados, 0 erros
```

## 📊 Tabelas Supabase

A function usa 3 tabelas:

| Tabela | Chave Primária | Uso |
|--------|----------------|-----|
| **tickets_cache** | (ticket_id, instance) | Dados normalizados com histórico |
| **sync_control** | instance | Estado da sincronização por instância |
| **sync_logs** | id (uuid) | Registro histórico de sincronizações |

## ⚠️ Validações

✓ Método HTTP deve ser POST
✓ Instance deve ser PETA ou GMX
✓ all_tickets deve ser array válido
✓ Cada ticket deve ter ticket_id > 0
✓ Instance do ticket deve corresponder ao payload
✓ Sem restrição de quantidade (recomendado: até 1000 por chamada)

## 🛠️ Tratamento de Erros

- Erros **não interrompem** a sincronização
- Cada ticket tem seu próprio tratamento
- Erros são registrados com contexto (ticket_id, mensagem)
- Resposta inclui resumo dos 5 primeiros erros
- Status HTTP apropriado (200 sucesso, 400 validação, 500 erro)

## 🎯 Próximos Passos

1. ✅ Merge na main (done)
2. Configurar secrets no Supabase
3. Deploy em staging
4. Testar com dados reais
5. Integrar com rotina de sincronização
6. Configurar monitoramento/alertas

## 📋 Casos de Uso

### Sincronização Incremental (cada 5 min)
```typescript
const recentTickets = await getTicketsModifiedSince(lastSync);
await sync("PETA", recentTickets);
```

### Sincronização Completa (diária)
```typescript
const allTickets = await getAllTicketsFromGlpi();
await syncBatch("PETA", allTickets, 1000);  // 1000 por lote
```

### Alertas de Mudanças Críticas
```typescript
const result = await sync("PETA", tickets);
const critical = result.changes_detected.filter(c =>
  c.changed_fields.some(f => ['status_id', 'is_sla_late'].includes(f))
);
if (critical.length > 0) await sendAlert(critical);
```

---

**Versão:** 1.0  
**Status:** ✅ Pronto para deploy  
**Criado:** 2026-04-30
