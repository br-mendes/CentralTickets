# 🎫 CentralTickets - Dashboard Setup

Seu dashboard possui 3 camadas principais:

## Arquitetura

```
┌─────────────────────────────────────────┐
│  Next.js Frontend  (app/page.js)        │
│  - Dashboard principal                  │
│  - Integrado com Supabase               │
└────────────────────┬────────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
         ▼           ▼           ▼
    ┌────────────────────────────────────┐
    │  Supabase (FONTE DE DADOS)         │
    │  - tickets_cache (dados brutos)    │
    └────────────────────────────────────┘
         │           │           │
         ▼           ▼           ▼
┌─────────────────────────────────────────┐
│  FastAPI Backend (backend/main.py)      │
│  - Endpoints REST                       │
│  - Processamento com Polars             │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Streamlit Dashboard (.claude/...)      │
│  - Visualizações avançadas              │
│  - Filtros + Relatórios                 │
│  - Exportação CSV                       │
└─────────────────────────────────────────┘
```

## Setup Inicial

### 1. Backend FastAPI

```bash
cd backend
pip install -r requirements.txt

# Exportar variáveis de ambiente
export SUPABASE_URL=seu_url
export SUPABASE_ANON_KEY=sua_chave

# Rodar server
python main.py
# ou
uvicorn main:app --reload --port 8000
```

Server disponível em: http://localhost:8000
Docs: http://localhost:8000/docs

### 2. Streamlit Dashboard

```bash
cd .claude/worktrees/elated-wescoff-3ad700/streamlit

# Instalar dependências
pip install -r requirements.txt

# Exportar variáveis de ambiente
export SUPABASE_URL=seu_url
export SUPABASE_ANON_KEY=sua_chave

# Rodar
streamlit run app.py
```

Acesso em: http://localhost:8501

### 3. Next.js Frontend

```bash
npm install
npm run dev
```

Acesso em: http://localhost:3000

---

## Endpoints FastAPI Disponíveis

| Endpoint | Método | Descrição | Params |
|----------|--------|-----------|--------|
| `/health` | GET | Status do servidor | - |
| `/api/tickets` | GET | Lista de tickets | `instances`, `status`, `priority`, `limit` |
| `/api/dashboard/stats` | GET | KPIs do dashboard | - |
| `/api/dashboard/trend` | GET | Tendência 30 dias | - |

### Exemplos:

```bash
# Health check
curl http://localhost:8000/health

# Pegar tickets
curl "http://localhost:8000/api/tickets?instances=PETA,GMX&limit=100"

# Stats do dashboard
curl http://localhost:8000/api/dashboard/stats

# Tendência
curl http://localhost:8000/api/dashboard/trend
```

---

## Próximas Etapas

- [ ] Integrar endpoints FastAPI no Next.js
- [ ] Adicionar WebSocket para atualizações em tempo real
- [ ] Criar cache com Redis
- [ ] Adicionar autenticação JWT
- [ ] Documentar modelos de dados (Pydantic)
- [ ] Configurar logging centralizado
