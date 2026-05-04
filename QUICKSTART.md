# 🚀 Quick Start - CentralTickets Dashboard

## ⚡ Antes de tudo - Configure as variáveis de ambiente

Copie seu `.env.example` e atualize com suas credenciais:

```bash
cp .env.example .env
# Edite .env com suas credenciais Supabase
```

---

## 🎯 Opção 1: Rodar tudo com Docker Compose (RECOMENDADO)

```bash
# Build e start
docker-compose up -d

# Verificar status
docker-compose ps

# Ver logs
docker-compose logs -f backend
docker-compose logs -f streamlit
docker-compose logs -f frontend
```

**Acessar:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/docs
- Streamlit: http://localhost:8501

---

## 🎯 Opção 2: Rodar localmente (desenvolvimento)

### Terminal 1: Backend FastAPI

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Acesso: http://localhost:8000/health

### Terminal 2: Streamlit Dashboard

```bash
cd .claude/worktrees/elated-wescoff-3ad700/streamlit
pip install -r requirements.txt
streamlit run app.py
```

Acesso: http://localhost:8501

### Terminal 3: Next.js Frontend

```bash
npm install
npm run dev
```

Acesso: http://localhost:3000

---

## 📊 Primeiro Acesso

1. **Abra o dashboard**: http://localhost:3000
2. **Teste a API**: http://localhost:8000/docs (Swagger UI)
3. **Veja os dados no Streamlit**: http://localhost:8501

---

## 🔗 Integração FastAPI ↔ Frontend

O backend expõe dados que o Next.js pode consumir:

```javascript
// Exemplo no app/page.js
const response = await fetch('http://localhost:8000/api/dashboard/stats');
const stats = await response.json();
```

---

## 🛑 Parar os serviços

```bash
# Docker
docker-compose down

# Local - Ctrl+C em cada terminal
```

---

## ✅ Checklist

- [ ] Variáveis de ambiente configuradas
- [ ] Supabase acessível
- [ ] Backend rodando (8000)
- [ ] Streamlit rodando (8501)
- [ ] Frontend rodando (3000)
- [ ] Dados aparecem no dashboard
