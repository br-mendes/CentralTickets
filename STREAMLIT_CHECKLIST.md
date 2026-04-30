# ✅ Checklist - Fazer Streamlit Funcionar

## 📋 Passos (em ordem)

### Passo 1: Credenciais Supabase
```bash
# Copie as credenciais do seu projeto
cd .claude/worktrees/elated-wescoff-3ad700/streamlit

# Edite o arquivo secrets.toml
nano .streamlit/secrets.toml
```

**Preencha com:**
```toml
SUPABASE_URL = "https://seu-projeto.supabase.co"
SUPABASE_ANON_KEY = "sua_chave_anonima"
```

✅ **Verifique:**
- URL começa com `https://`?
- Chave começa com `eyJ...`?
- Arquivo salvo sem erros?

---

### Passo 2: Instale Python dependencies
```bash
pip install -r requirements.txt
```

✅ **Verifique:**
```bash
python -c "import streamlit; import polars; import supabase; print('OK')"
```

---

### Passo 3: Rode o Streamlit

**Opção A: Use a versão melhorada (RECOMENDADO)**
```bash
streamlit run app_v2.py
```

**Opção B: Use o original**
```bash
streamlit run app.py
```

✅ **Verifique:**
- Terminal mostra `Local URL: http://localhost:8501`
- Browser abre automaticamente
- **Sidebar aparece à esquerda com "🎫 CentralTickets"**

---

### Passo 4: Teste os Filtros

**Na sidebar que apareceu, você deve ver:**

```
🎫 CentralTickets
─────────────────
📍 Instância
  [ Selectbox: PETA + GMX | PETA | GMX ]

🔍 Filtros
  Status     [ Selectbox: Todos | Novo | ... ]
  Tipo       [ Selectbox: Todos | Incidente | ... ]
  Prioridade [ Selectbox: Todas | Muito Baixa | ... ]
  ☐ Apenas SLA excedido

📅 Período
  [De]  [ Date picker ]
  [Até] [ Date picker ]

───────────────────────
  [ 🔄 Recarregar ]
  [ ❌ Limpar ]
```

✅ **Todos os elementos aparecem?**
- [ ] Selectbox de Instância
- [ ] Selectbox de Status
- [ ] Selectbox de Tipo
- [ ] Selectbox de Prioridade
- [ ] Checkbox de SLA
- [ ] 2 Date pickers
- [ ] 2 Botões

---

## 🐛 Se algo não funcionar

### Erro: "Supabase não configurado"
```bash
# 1. Verifique arquivo existe
ls -la .streamlit/secrets.toml

# 2. Verifique conteúdo
cat .streamlit/secrets.toml

# 3. Se vazio, edite:
nano .streamlit/secrets.toml

# 4. Salve (Ctrl+O, Enter, Ctrl+X)

# 5. Reinicie Streamlit (Ctrl+C, seta pra cima, Enter)
```

### Erro: "KeyError: SUPABASE_URL"
- ❌ Secrets.toml com erro de sintaxe
- ✅ Verifique se tem `=` após `SUPABASE_URL`
- ✅ Verifique aspas (devem ser `"`)

### Sidebar não aparece
- ✅ Clique no `>` no canto superior esquerdo
- ✅ Use `app_v2.py` em vez de `app.py`
- ✅ Faça Ctrl+R para recarregar a página

### Nenhum ticket aparece
- ✅ Dados existem em `tickets_cache`?
- ✅ Instâncias selecionadas existem (PETA/GMX)?
- ✅ Datas dos filtros fazem sentido?

---

## 🟢 Sucesso! O que você verá

1. **Sidebar esquerda** com filtros interativos
2. **Abas** no topo: "📈 Visão Geral", "🔴 SLA", "📋 Relatórios"
3. **KPIs** mostrando números de tickets
4. **Gráficos Plotly** com dados filtrados
5. **Tabelas** de dados com opção de download CSV

---

## 💡 Dicas

### Para limpar cache se dados estão desatualizados
```bash
# Forçar recarga
# Clique em "🔄 Recarregar" na sidebar
```

### Para debug
```bash
streamlit run app_v2.py --logger.level=debug
```

### Para trocar URL do Supabase depois
```bash
nano .streamlit/secrets.toml
# Edite e salve
# Ctrl+C no terminal (Streamlit)
# Seta pra cima + Enter para rodar de novo
```

---

## ✨ Resultado Final Esperado

Quando tudo funcionar, você verá:

```
┌─────────────────────────────────────────────────────────────┐
│                    STREAMLIT DASHBOARD                      │
├──────────────┬─────────────────────────────────────────────┤
│ 🎫 SIDEBAR   │         MAIN CONTENT AREA                   │
│              │  ┌─────────────────────────────────────────┐│
│ 📍 Instância │  │ 📈 Visão Geral | 🔴 SLA | 📋 Relatórios││
│ [Dropdown]   │  │─────────────────────────────────────────││
│              │  │ 📊 Stats (6 cards com números)          ││
│ 🔍 Filtros   │  │                                         ││
│ Status [DD]  │  │ [Gráfico Status]  [Gráfico Tendência]  ││
│ Tipo [DD]    │  │                                         ││
│ Prior. [DD]  │  │ [Gráfico Priority] [Gráfico Request]   ││
│ ☐ SLA        │  │                                         ││
│              │  │ [Gráfico Técnico]  [Gráfico Categoria] ││
│ 📅 Período   │  │                                         ││
│ [Picker]     │  │ [Gráfico Entidades]                    ││
│ [Picker]     │  │                                         ││
│              │  └─────────────────────────────────────────┘│
│ [Recarregar] │                                             │
│ [Limpar]     │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

**Status: ✅ PRONTO**
