# 📚 Índice Completo - Edge Function de Sincronização GLPI

Bem-vindo! Este documento ajuda você a navegar por toda a documentação e código da edge function de sincronização.

## 🎯 Começar Rápido (5 min)

1. **Entender o que faz:** Leia [O que faz a function?](#o-que-faz-a-function)
2. **Ver exemplo:** Veja [Exemplo de Uso](#exemplo-de-uso-rápido)
3. **Deploy:** Siga [DEPLOYMENT.md](./DEPLOYMENT.md) passo a passo

## 📁 Estrutura de Arquivos

```
sync-glpi-tickets/
├── INDEX.md                    📍 Você está aqui
├── README.md                   📖 Visão geral completa
├── MAPPING.md                  🗺️ Mapeamento de campos
├── DEPLOYMENT.md               🚀 Guia de deploy
├── index.ts                    ⚙️ Função principal
├── types.ts                    📝 Tipos TypeScript
├── example.ts                  💡 Exemplos de uso
├── test.ts                     🧪 Suite de testes
└── deno.json                   ⚙️ Configuração Deno
```

## 🔍 Encontre o Que Precisa

### 📖 Documentação por Tópico

#### **Para Entender a Solução**
- [README.md](./README.md) - Visão geral, funcionalidades e examples básicos
- [O que faz a function?](#o-que-faz-a-function) - Explicação visual

#### **Para Implementar**
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Passo a passo de deployment
- [types.ts](./types.ts) - Tipos TypeScript para usar a função
- [example.ts](./example.ts) - Exemplos de integração (retry, batching, etc)

#### **Para Integrar com Dados**
- [MAPPING.md](./MAPPING.md) - Mapeamento JSON GLPI → Schema BD
- [Normalização de Dados](#normalização-de-dados) em MAPPING.md
- [Detecção Incremental](#detecção-incremental-de-mudanças) em MAPPING.md

#### **Para Monitorar/Debugar**
- [Monitoramento](./README.md#monitoramento) em README.md
- [Troubleshooting](./DEPLOYMENT.md#troubleshooting) em DEPLOYMENT.md
- [Logs Detalhados](#logs-detalhados) em README.md

#### **Para Testar**
- [test.ts](./test.ts) - Suite completa de testes
- [Executar testes](#executar-testes) abaixo

---

## ✨ O Que Faz a Function

A edge function sincroniza tickets da API GLPI (dois sistemas: PETA e GMX) para Supabase com:

```
┌─────────────────┐
│  API GLPI       │  
│  PETA / GMX     │
└────────┬────────┘
         │ (JSON)
         ↓
┌─────────────────────────────────────────────────────┐
│     EDGE FUNCTION (Supabase)                        │
│  sync-glpi-tickets                                  │
│                                                     │
│  ✅ Valida estrutura JSON                          │
│  ✅ Mapeia campos para schema BD                    │
│  ✅ Detecta mudanças incrementais                   │
│  ✅ Registra quais campos mudaram                   │
│  ✅ Normaliza tipos de dados                        │
│  ✅ Gera logs detalhados                            │
│  ✅ Trata erros granularmente                       │
│  ✅ Funciona para PETA e GMX                        │
└────────┬────────────────────────────────────────────┘
         │ (Upsert/Update)
         ↓
┌────────────────────┐
│ Supabase BD        │
├────────────────────┤
│ tickets_cache      │ ← Dados dos tickets
│ sync_control       │ ← Estado da sincronização
│ sync_logs          │ ← Histórico
└────────────────────┘
```

## 🚀 Exemplo de Uso Rápido

### Entrada (JSON da API GLPI)

```json
{
  "instance": "PETA",
  "all_tickets": [
    {
      "ticket_id": 10830,
      "instance": "PETA",
      "title": "[HIGH] Sistema Down",
      "status_id": 2,
      "status_name": "Em atendimento",
      "priority_id": 1,
      "priority": "1-Crítica",
      "date_mod": "2026-04-30T10:00:00Z",
      "is_deleted": false,
      ...
    }
  ],
  "timestamp": "2026-04-30T10:00:00Z"
}
```

### JavaScript/TypeScript

```typescript
import { SyncPayload, SyncLogResponse } from './types';

const response = await fetch(
  'https://seu-projeto.supabase.co/functions/v1/sync-glpi-tickets',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer sua-chave',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }
);

const result: SyncLogResponse = await response.json();

console.log(`✅ ${result.tickets_added} adicionados`);
console.log(`♻️ ${result.tickets_updated} atualizados`);
console.log(`📊 ${result.changes_detected.length} mudanças`);
```

### Saída (Resposta)

```json
{
  "instance": "PETA",
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
    "[2026-04-30T10:00:00Z] 🚀 Iniciando...",
    "[2026-04-30T10:00:00Z] 📊 Total: 20",
    "[2026-04-30T10:00:01Z] ✅ Ticket #10830 adicionado",
    ...
  ]
}
```

## 📊 Detecção Incremental de Mudanças

A function detecta **automaticamente** quais campos mudaram:

```
Primeira sincronização:
  Ticket #10830: [vazio] → novo registro
  Resultado: NOVO (todos os campos marcados)

Segunda sincronização (mesmo ticket, dados diferentes):
  Ticket #10830: status "Novo" → "Em atendimento"
  Ticket #10830: prioridade 2 → 1
  Resultado: ATUALIZADO (apenas 2 campos mudaram)
```

**Campos monitorados:** title, content, entity, status, priority, technician, date_mod, solution, is_deleted, e mais 20+ campos.

Veja [Detecção Incremental de Mudanças](./MAPPING.md#detecção-incremental-de-mudanças) para detalhes.

## 🗺️ Mapeamento de Campos

A function mapeia automaticamente:

| JSON GLPI | Schema BD | Tipo | Normalização |
|-----------|-----------|------|--------------|
| `ticket_id` | `ticket_id` | INTEGER | Obrigatório |
| `instance` | `instance` | VARCHAR | PETA ou GMX |
| `title` | `title` | TEXT | null se vazio |
| `status_id` | `status_id` | INTEGER | null se não definido |
| `priority_id` | `priority_id` | INTEGER | padrão: 1 |
| `date_mod` | `date_mod` | TIMESTAMP | ISO 8601 |

Veja [MAPPING.md](./MAPPING.md) para tabela completa com **todos os campos**.

## 📝 Logs Detalhados

Cada sincronização gera logs com timestamps e emojis:

```
🚀 Iniciando sincronização para instância: PETA
📊 Total de tickets recebidos: 20
⏱️ Última sincronização: 2026-04-30T09:00:00Z
⏳ Processados 10/20 tickets
✅ Novo ticket adicionado: #10830
♻️ Ticket atualizado: #10831
🔄 Mudanças detectadas em #10832: status_name, priority, date_mod
✨ Sincronização concluída: 3 adicionados, 15 atualizados, 2 erros
```

Veja [Logs Detalhados](./README.md#logs-detalhados) em README.md.

## 🧪 Executar Testes

```bash
# Teste unitário (sem dependências externas)
deno run supabase/functions/sync-glpi-tickets/test.ts

# Teste com Supabase local
supabase start
supabase functions serve

# Teste em staging/produção
curl -X POST https://seu-projeto.supabase.co/functions/v1/sync-glpi-tickets \
  -H "Authorization: Bearer sua-chave" \
  -H "Content-Type: application/json" \
  -d @payload.json
```

Veja [test.ts](./test.ts) para suite completa.

## 🚀 Deploy em 3 Passos

### Passo 1: Preparar
```bash
supabase login
supabase link --project-ref seu-projeto-id
```

### Passo 2: Configurar
```bash
supabase secrets set SUPABASE_URL=https://...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

### Passo 3: Deploy
```bash
supabase functions deploy sync-glpi-tickets
```

Veja [DEPLOYMENT.md](./DEPLOYMENT.md) para detalhes completos.

## 📊 Monitoramento

### Verificar Status

```sql
-- Última sincronização por instância
SELECT instance, last_sync, status, tickets_count 
FROM sync_control 
ORDER BY updated_at DESC;

-- Histórico de sincronizações
SELECT instance, started_at, status, tickets_added, tickets_updated
FROM sync_logs
ORDER BY started_at DESC
LIMIT 10;

-- Mudanças recentes
SELECT ticket_id, updated_at, status_name, priority
FROM tickets_cache
WHERE instance = 'PETA'
AND updated_at > NOW() - INTERVAL '1 day'
ORDER BY updated_at DESC;
```

Veja [Monitoramento](./README.md#monitoramento) em README.md.

## 🔧 Normalização de Dados

A function normaliza automaticamente:

```typescript
{
  "title": null,           // Mantém NULL
  "title": "",             // Mantém string vazia
  "priority_id": null,     // Converte para 1 (padrão)
  "is_deleted": null,      // Converte para false
  "raw_data": {...},       // JSON original preservado
  "last_sync": "2026-04-30T10:00:00Z"  // Timestamp da sincronização
}
```

Veja [Normalização de Dados](./MAPPING.md#normalização-de-dados) em MAPPING.md.

## ❌ Tratamento de Erros

A function captura e registra erros sem parar:

```json
{
  "errors": [
    {
      "ticket_id": 10831,
      "error": "Instância inconsistente: esperado PETA, recebido GMX"
    },
    {
      "error": "Falha na conexão com BD"
    }
  ]
}
```

Cada ticket processado tem seu próprio tratamento de erro - um erro não impede outros tickets de serem sincronizados.

## 📚 Referência Rápida

| Preciso de... | Arquivo | Link |
|-------------|---------|------|
| Visão geral | README.md | [Abrir](./README.md) |
| Começar | DEPLOYMENT.md | [Abrir](./DEPLOYMENT.md) |
| Integrar | example.ts | [Abrir](./example.ts) |
| Testar | test.ts | [Abrir](./test.ts) |
| Campos mapeados | MAPPING.md | [Abrir](./MAPPING.md) |
| Tipos TS | types.ts | [Abrir](./types.ts) |
| Código | index.ts | [Abrir](./index.ts) |

## 🎯 Fluxo de Implementação

```
1. Ler README.md (5 min)
   ↓
2. Seguir DEPLOYMENT.md (10 min)
   ↓
3. Rodar test.ts (5 min)
   ↓
4. Integrar com example.ts (15 min)
   ↓
5. Configurar monitoramento (10 min)
   ↓
6. Deploy em produção ✨
```

## ❓ Perguntas Frequentes

**P: Como faço para processar apenas tickets mudados?**
R: A function detecta automaticamente mudanças. Veja [Detecção Incremental](./MAPPING.md#detecção-incremental-de-mudanças).

**P: Qual é o limite de tickets por sincronização?**
R: Não há limite fixo, mas recomenda-se 1000 por chamada. Veja [Performance](./MAPPING.md#performance-e-otimizações).

**P: Como adiciono campos novos?**
R: Adicione em `MONITORED_FIELDS` em `index.ts` se quiser detectar mudanças, ou em `normalizeData()` para apenas armazenar.

**P: Funciona offline?**
R: Não, precisa de conexão com Supabase. A function roda na nuvem.

**P: Posso sincronizar apenas PETA ou apenas GMX?**
R: Sim, basta enviar `instance: "PETA"` ou `instance: "GMX"` no payload.

**P: Como recupero de um erro de sincronização?**
R: Simplesmente reenvie o payload - a function fará upsert dos dados.

## 🔒 Segurança

- ✅ Usa `service_role` key (privada)
- ✅ Valida entrada JSON
- ✅ Normaliza tipos de dados
- ✅ Registra todos os erros
- ✅ Não expõe stack traces
- ✅ Logs com timestamps para auditoria

## 📞 Suporte

1. Verifique [Troubleshooting](./DEPLOYMENT.md#troubleshooting) em DEPLOYMENT.md
2. Consulte logs: `supabase functions list`
3. Procure por palavra-chave neste índice
4. Contate o time de desenvolvimento

---

## 📌 Últimas Atualizações

- ✅ v1.0 - Sincronização incremental completa
- ✅ Detecção de mudanças por campo
- ✅ Logs detalhados com timestamps
- ✅ Suporte PETA e GMX
- ✅ Documentação completa
- ✅ Suite de testes

---

**Criado em:** 2026-04-30  
**Versão:** 1.0  
**Atualizado:** 2026-04-30  
**Status:** ✅ Pronto para produção

