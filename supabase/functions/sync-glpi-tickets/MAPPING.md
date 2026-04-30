# Mapeamento de Campos e Detecção Incremental

## Visão Geral

Este documento detalha como os campos da API GLPI são mapeados para o schema Supabase e como a detecção incremental funciona.

## Estrutura de Mapeamento

### Categorias de Campos

#### 1️⃣ **Identificadores** (Sempre Validados)
Campos que identificam de forma única um ticket no banco de dados.

| Campo JSON | Campo BD | Tipo | Validação | Descrição |
|-----------|----------|------|-----------|-----------|
| `ticket_id` | `ticket_id` | INTEGER | ✅ Obrigatório | ID único do ticket |
| `instance` | `instance` | VARCHAR | ✅ Obrigatório (PETA/GMX) | Instância GLPI |

**Uso na Chave Primária:** `PRIMARY KEY (ticket_id, instance)`

#### 2️⃣ **Informações Básicas** (Monitored para Mudanças)
Dados textuais e descritivos que mudam frequentemente.

| Campo JSON | Campo BD | Tipo | Padrão | Monitorado | Descrição |
|-----------|----------|------|--------|-----------|-----------|
| `title` | `title` | TEXT | NULL | ✅ SIM | Título do ticket |
| `content` | `content` | TEXT | NULL | ✅ SIM | Conteúdo/descrição |
| `solution` | `solution` | TEXT | NULL | ✅ SIM | Solução aplicada |
| `solution_content` | `solution_content` | TEXT | NULL | ❌ NÃO | Conteúdo da solução |
| `location` | `location` | TEXT | "" | ❌ NÃO | Localização |
| `request_source` | `request_source` | VARCHAR | "" | ❌ NÃO | Fonte da solicitação |

#### 3️⃣ **Entidades e Categorias** (Monitored para Mudanças)
Informações sobre a organização e categorização.

| Campo JSON | Campo BD | Tipo | Padrão | Monitorado | Descrição |
|-----------|----------|------|--------|-----------|-----------|
| `entity` | `entity` | TEXT | NULL | ✅ SIM | Entidade principal |
| `entity_full` | `entity_full` | TEXT | NULL | ❌ NÃO | Caminho completo da entidade |
| `entity_id` | `entity_id` | INTEGER | 0 | ❌ NÃO | ID da entidade |
| `entity_name` | `entity_name` | TEXT | NULL | ❌ NÃO | Nome completo da entidade |
| `category` | `category` | TEXT | NULL | ✅ SIM | Categoria completa |
| `category_name` | `category_name` | TEXT | NULL | ❌ NÃO | Nome da categoria |
| `root_category` | `root_category` | TEXT | NULL | ❌ NÃO | Categoria raiz |

#### 4️⃣ **Atores** (Monitored para Mudanças)
Pessoas envolvidas no ticket.

| Campo JSON | Campo BD | Tipo | Padrão | Monitorado | Descrição |
|-----------|----------|------|--------|-----------|-----------|
| `technician` | `technician` | TEXT | NULL | ✅ SIM | Nome do técnico |
| `technician_id` | `technician_id` | INTEGER | 0 | ✅ SIM | ID do técnico |
| `technician_email` | `technician_email` | TEXT | NULL | ❌ NÃO | Email do técnico |
| `requester` | `requester` | TEXT | NULL | ✅ SIM | Solicitante |
| `requester_id` | `requester_id` | INTEGER | 0 | ✅ SIM | ID do solicitante |
| `requester_fullname` | `requester_fullname` | TEXT | NULL | ❌ NÃO | Nome completo do solicitante |
| `requester_email` | `requester_email` | TEXT | NULL | ❌ NÃO | Email do solicitante |
| `group_name` | `group_name` | TEXT | NULL | ✅ SIM | Nome do grupo |
| `group_id` | `group_id` | BIGINT | 0 | ✅ SIM | ID do grupo |

#### 5️⃣ **Status e Tipos** (Monitored para Mudanças)
Estados e classificações do ticket.

| Campo JSON | Campo BD | Tipo | Padrão | Monitorado | Descrição |
|-----------|----------|------|--------|-----------|-----------|
| `status_id` | `status_id` | INTEGER | NULL | ✅ SIM | ID do status |
| `status_key` | `status_key` | VARCHAR | NULL | ✅ SIM | Chave do status (novo, processing, etc) |
| `status_name` | `status_name` | TEXT | NULL | ✅ SIM | Nome descritivo do status |
| `priority_id` | `priority_id` | INTEGER | 1 | ✅ SIM | ID da prioridade |
| `priority` | `priority` | TEXT | "1-Baixa" | ✅ SIM | Nome da prioridade |
| `type_id` | `type_id` | INTEGER | 2 | ✅ SIM | ID do tipo |
| `urgency` | `urgency` | INTEGER | 3 | ✅ SIM | Nível de urgência |
| `impact` | `impact` | INTEGER | 3 | ❌ NÃO | Nível de impacto |
| `request_type` | `request_type` | TEXT | NULL | ✅ SIM | Tipo de solicitação |
| `request_type_id` | `request_type_id` | INTEGER | 0 | ❌ NÃO | ID do tipo |

#### 6️⃣ **Datas** (Monitored para Mudanças)
Marcos temporais do ciclo de vida.

| Campo JSON | Campo BD | Tipo | Padrão | Monitorado | Descrição |
|-----------|----------|------|--------|-----------|-----------|
| `date_created` | `date_created` | TIMESTAMP | NULL | ❌ NÃO | Data de criação |
| `date_mod` | `date_mod` | TIMESTAMP | NULL | ✅ SIM | Última modificação |
| `date_solved` | `date_solved` | TIMESTAMP | NULL | ✅ SIM | Data de resolução |
| `date_close` | `date_close` | TIMESTAMP | NULL | ✅ SIM | Data de fechamento |
| `due_date` | `due_date` | TIMESTAMP | NULL | ✅ SIM | Data de vencimento |
| `take_into_account_date` | `take_into_account_date` | TIMESTAMP | NULL | ❌ NÃO | Data de aceite |
| `solution_date` | `solution_date` | TIMESTAMP | NULL | ❌ NÃO | Data da solução |

#### 7️⃣ **SLA e Métricas** (Monitored para Mudanças)
Indicadores de desempenho.

| Campo JSON | Campo BD | Tipo | Padrão | Monitorado | Descrição |
|-----------|----------|------|--------|-----------|-----------|
| `is_sla_late` | `is_sla_late` | BOOLEAN | false | ✅ SIM | SLA violado? |
| `is_overdue_first` | `is_overdue_first` | BOOLEAN | false | ✅ SIM | Atrasado para aceite? |
| `is_overdue_resolve` | `is_overdue_resolve` | BOOLEAN | false | ✅ SIM | Atrasado para resolução? |
| `sla_percentage_first` | `sla_percentage_first` | NUMERIC | NULL | ✅ SIM | % de SLA para aceite |
| `sla_percentage_resolve` | `sla_percentage_resolve` | NUMERIC | NULL | ✅ SIM | % de SLA para resolução |
| `sla_ttr_name` | `sla_ttr_name` | TEXT | NULL | ❌ NÃO | Nome SLA Time-to-Resolve |
| `sla_tto_name` | `sla_tto_name` | TEXT | NULL | ❌ NÃO | Nome SLA Time-to-Own |

#### 8️⃣ **Duração e Status Técnico** (Não Monitorado)
Informações derivadas.

| Campo JSON | Campo BD | Tipo | Padrão | Monitorado | Descrição |
|-----------|----------|------|--------|-----------|-----------|
| `waiting_duration` | `waiting_duration` | INTEGER | 0 | ❌ NÃO | Duração em espera (minutos) |
| `resolution_duration` | `resolution_duration` | INTEGER | 0 | ❌ NÃO | Duração até resolução (minutos) |
| `global_validation` | `global_validation` | INTEGER | 1 | ❌ NÃO | Status de validação |
| `is_deleted` | `is_deleted` | BOOLEAN | false | ✅ SIM | Marcado como deletado? |

#### 9️⃣ **Campos do Sistema** (Não Vêm da API)
Adicionados pela edge function.

| Campo BD | Tipo | Preenchido Por | Descrição |
|----------|------|----------------|-----------|
| `raw_data` | JSONB | Função | Payload completo da API |
| `last_sync` | TIMESTAMP | Função | Última sincronização |
| `created_at` | TIMESTAMP | BD | Criação do registro |
| `updated_at` | TIMESTAMP | BD | Atualização do registro |
| `time_to_own` | TIMESTAMP | - | Tempo até aceite (vazio) |
| `time_to_resolve` | TIMESTAMP | - | Tempo até resolução (vazio) |

## Detecção Incremental de Mudanças

### Algoritmo de Detecção

```
PARA CADA ticket:
  1. Buscar ticket antigo em tickets_cache (ticket_id, instance)
  
  2. SE ticket antigo não existe:
     - Marcar como NOVO
     - Todos os campos são "mudanças"
  
  3. SE ticket antigo existe:
     - PARA CADA campo monitorado:
       - Comparar valor antigo com novo (JSON stringify)
       - SE diferente: adicionar à lista de mudanças
     - SE houver mudanças: registrar em changes_detected
  
  4. Fazer UPSERT no BD (insert ou update)
```

### Campos Monitorados para Mudanças

Apenas esses campos disparam a detecção de mudança:

```typescript
const MONITORED_FIELDS = [
  "title",                    // Mudança no título
  "content",                  // Mudança na descrição
  "entity",                   // Mudança de entidade
  "category",                 // Mudança de categoria
  "technician",              // Mudança de técnico
  "technician_id",           // Mudança de ID do técnico
  "requester",               // Mudança de solicitante
  "requester_id",            // Mudança de ID do solicitante
  "group_name",              // Mudança de grupo
  "group_id",                // Mudança de ID do grupo
  "request_type",            // Mudança de tipo de solicitação
  "status_id",               // Mudança de status
  "status_key",              // Mudança de chave de status
  "status_name",             // Mudança de nome de status
  "priority_id",             // Mudança de prioridade
  "priority",                // Mudança de nome de prioridade
  "type_id",                 // Mudança de tipo
  "urgency",                 // Mudança de urgência
  "impact",                  // Mudança de impacto
  "date_mod",                // Mudança na data de modificação
  "date_solved",             // Mudança na data de resolução
  "date_close",              // Mudança na data de fechamento
  "due_date",                // Mudança na data de vencimento
  "is_sla_late",             // Mudança no status de SLA
  "is_overdue_first",        // Mudança no status de atraso (aceite)
  "is_overdue_resolve",      // Mudança no status de atraso (resolução)
  "sla_percentage_first",    // Mudança na % de SLA (aceite)
  "sla_percentage_resolve",  // Mudança na % de SLA (resolução)
  "solution",                // Mudança na solução
  "is_deleted",              // Mudança no status de deleção
];
```

### Exemplo de Detecção

**Entrada Original:**
```json
{
  "ticket_id": 10830,
  "instance": "GMX",
  "title": "[HIGH] utm — Cofen",
  "status_id": 1,
  "status_name": "Novo",
  "priority_id": 2,
  "priority": "2-Média",
  "date_mod": "2026-04-29T11:00:00Z"
}
```

**Nova Entrada (após atualização na API):**
```json
{
  "ticket_id": 10830,
  "instance": "GMX",
  "title": "[HIGH] utm — Cofen",
  "status_id": 2,
  "status_name": "Em atendimento",
  "priority_id": 3,
  "priority": "1-Baixa",
  "date_mod": "2026-04-30T07:31:03Z",
  "technician": "Leonardo Kuhn",
  "technician_id": 45
}
```

**Resultado da Detecção:**
```json
{
  "ticket_id": 10830,
  "changed_fields": [
    "status_id",
    "status_name",
    "priority_id",
    "priority",
    "date_mod",
    "technician",
    "technician_id"
  ],
  "old_values": {
    "status_id": 1,
    "status_name": "Novo",
    "priority_id": 2,
    "priority": "2-Média",
    "date_mod": "2026-04-29T11:00:00Z",
    "technician": null,
    "technician_id": 0
  },
  "new_values": {
    "status_id": 2,
    "status_name": "Em atendimento",
    "priority_id": 3,
    "priority": "1-Baixa",
    "date_mod": "2026-04-30T07:31:03Z",
    "technician": "Leonardo Kuhn",
    "technician_id": 45
  }
}
```

**Log Gerado:**
```
[2026-04-30T07:31:15.123Z] 🔄 Mudanças detectadas em #10830: status_id, status_name, priority_id, priority, date_mod, technician, technician_id
```

## Normalização de Dados

### Regras Aplicadas Automaticamente

| Situação | Ação | Resultado |
|----------|------|-----------|
| Campo `null` no JSON | Manter como NULL | `null` → `NULL` |
| String vazia `""` | Manter como string vazia | `""` → `""` |
| Número faltante | Usar padrão | `undefined` → `0` ou `1` |
| Booleano faltante | Usar false | `undefined` → `false` |
| Data inválida | Manter como NULL | `"invalid"` → `NULL` |
| Campo não esperado | Incluir em `raw_data` | Preservado em JSON |

### Exemplos de Normalização

**Entrada Raw:**
```json
{
  "ticket_id": 10830,
  "title": "[HIGH] Issue",
  "technician": null,
  "priority_id": null,
  "entity_id": null,
  "is_deleted": false,
  "location": ""
}
```

**Após Normalização:**
```json
{
  "ticket_id": 10830,
  "title": "[HIGH] Issue",
  "technician": null,              // Mantém NULL
  "technician_id": 0,              // Padrão para ID
  "priority_id": 1,                // Padrão 1
  "entity_id": 0,                  // Padrão 0
  "is_deleted": false,             // Mantém false
  "location": "",                  // Mantém string vazia
  "raw_data": {...},               // JSON original completo
  "last_sync": "2026-04-30T..."    // Timestamp de sincronização
}
```

## Validações de Integridade

### Validações Realizadas

✅ **Presença Obrigatória:**
- `ticket_id` - Deve existir e ser > 0
- `instance` - Deve ser PETA ou GMX

✅ **Consistência:**
- Instance do ticket = Instance do payload
- Tipos de dados correspondem ao schema

✅ **Lógica de Negócio:**
- Nenhuma validação de lógica de negócio (ex: status progression)
- Dados são aceitos conforme recebidos

### Tratamento de Erros

| Erro | Ação | Resultado |
|------|------|-----------|
| Ticket sem ID | Pular ticket, registrar erro | Não inserido, log gerado |
| Instance inconsistente | Pular ticket, registrar erro | Não inserido, log gerado |
| Erro de BD | Registrar erro, continuar próximo | Ticket não processado |
| Erro não tratado | Parar sincronização | Status "failed" retornado |

## Performance e Otimizações

### Estratégias de Detecção Eficientes

1. **Comparação de Strings:**
   - Usa `JSON.stringify()` para comparar valores complexos
   - Evita comparações field-by-field para objetos

2. **Cache em Memória:**
   - Cada ticket processado em ciclo: fetch + process + insert
   - Sem acumulação desnecessária de dados

3. **Batch Processing:**
   - Recomendação: 1000 tickets por chamada
   - Reduz latência e memória

4. **Índices no BD:**
   ```sql
   -- Essencial para performance
   CREATE INDEX idx_tickets_cache_instance 
     ON tickets_cache(instance);
   
   CREATE INDEX idx_tickets_cache_date_mod 
     ON tickets_cache(date_mod DESC);
   
   CREATE INDEX idx_sync_control_instance 
     ON sync_control(instance);
   ```

## Casos de Uso Específicos

### Caso 1: Sincronização Incremental com Frequência

**Cenário:** Sincronizar a cada 5 minutos para capturar mudanças rápidas

**Implementação:**
```typescript
// Buscar apenas últimas N horas
const lastSync = await getLastSyncTimestamp(instance);
const recentTickets = tickets.filter(t => 
  new Date(t.date_mod) > new Date(lastSync)
);

// Sincronizar apenas mudanças
const result = await sync(instance, recentTickets);
```

**Benefício:** Reduz payload, detecta mudanças em tempo real

### Caso 2: Sincronização Completa Diária

**Cenário:** Sincronizar todos os tickets uma vez por dia

**Implementação:**
```typescript
const allTickets = await fetchFromGlpi(instance, {
  page: 1,
  limit: 10000
});

const result = await syncBatch(instance, allTickets, 1000);

// Log de métricas
logMetrics({
  instance,
  totalTickets: allTickets.length,
  newTickets: result.tickets_added,
  updatedTickets: result.tickets_updated,
  errors: result.errors.length
});
```

**Benefício:** Garante sincronização completa, detecta deleções

### Caso 3: Detectar Mudanças Críticas

**Cenário:** Alertar quando status ou SLA muda

**Implementação:**
```typescript
const result = await sync(instance, tickets);

const criticalChanges = result.changes_detected.filter(change =>
  change.changed_fields.some(f => 
    ['status_id', 'status_name', 'is_sla_late'].includes(f)
  )
);

if (criticalChanges.length > 0) {
  await sendAlert({
    instance,
    changes: criticalChanges,
    severity: 'HIGH'
  });
}
```

**Benefício:** Notificação em tempo real de mudanças críticas

## Queries SQL para Análise

### Ver Mudanças Recentes
```sql
SELECT 
  tc.ticket_id,
  tc.title,
  tc.instance,
  tc.updated_at,
  tc.status_name,
  tc.priority
FROM tickets_cache tc
WHERE tc.instance = 'GMX'
  AND tc.updated_at > NOW() - INTERVAL '1 day'
ORDER BY tc.updated_at DESC
LIMIT 100;
```

### Encontrar Tickets com Muitas Mudanças
```sql
SELECT 
  ticket_id,
  COUNT(*) as mudancas,
  MAX(started_at) as ultima_mudanca
FROM sync_logs,
     jsonb_array_elements(raw_data) as changes
WHERE instance = 'PETA'
GROUP BY ticket_id
HAVING COUNT(*) > 5
ORDER BY mudancas DESC;
```

### Taxa de Sincronização
```sql
SELECT 
  instance,
  DATE(started_at) as data,
  COUNT(*) as total_syncs,
  AVG(tickets_processed) as media_processada,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as sucessos,
  SUM(tickets_added) as total_adicionados,
  SUM(tickets_updated) as total_atualizados
FROM sync_logs
GROUP BY instance, DATE(started_at)
ORDER BY data DESC;
```

## Checklist de Implementação

- [ ] Edge function deployada
- [ ] Variáveis de ambiente configuradas (SUPABASE_URL, SERVICE_ROLE_KEY)
- [ ] Tabelas criadas no BD (tickets_cache, sync_control, sync_logs)
- [ ] Índices criados para performance
- [ ] Testes executados com payload de exemplo
- [ ] Monitoramento/alertas configurados
- [ ] Documentação compartilhada com equipe
- [ ] Rotina de sincronização agendada
