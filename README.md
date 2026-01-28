# CentralTickets

Sistema unificado de visualização de tickets GLPI para instâncias PETA e GMX.

## Funcionalidades

- 🎫 **Client Multi-versão GLPI**: Suporte automático para GLPI <11 (REST v1) e GLPI 11+ (OAuth2)
- 📊 **SLA em Tempo Real**: Cálculo de percentuais para primeiro atendimento e resolução
- 🔔 **Sistema de Alertas**: Detecção automática quando SLA ≥ 70% (configurável)
- 🌐 **Múltiplas Instâncias**: Suporte para PETA e GMX com fallback inteligente
- 💾 **Cache com Supabase**: Persistência e performance com upsert automático
- 🎨 **Dashboard Responsivo**: Interface moderna com indicadores visuais de SLA
- 🏷️ **Rótulos em PT-BR**: Status traduzidos: Novo, Atribuído, Planejado, Em espera, Solucionado, Fechado
- 🛡️ **Tratamento de Erros**: Degradação graciosa com avisos informativos

## Arquitetura

```
src/
├── lib/
│   ├── glpi/
│   │   ├── index.ts       # Orquestrador com fallback inteligente
│   │   ├── legacy.ts      # GLPI <11 - session tokens
│   │   └── hl.ts         # GLPI 11+ - OAuth2
│   ├── sla.ts            # Cálculo de SLA com date-fns
│   ├── supabase/        # Cache e persistência
│   └── utils.ts          # Utilitários (status, alerts)
├── components/
│   ├── dashboard.tsx      # Dashboard principal
│   └── tickets/
│       ├── ticket-grid.tsx     # Grid de tickets
│       ├── ticket-card.tsx     # Card individual
│       └── sla-indicator.tsx  # Indicadores de SLA
├── app/
│   └── api/
│       └── tickets/        # API endpoint unificado
└── types/
    └── glpi.ts          # Tipos TypeScript completos
```

## Configuração

### Variáveis de Ambiente

```env
# GLPI PETA
GLPI_PETA_URL=https://glpi.petacorp.com.br
GLPI_PETA_API_URL=https://glpi.petacorp.com.br/glpi/apirest.php
GLPI_PETA_APP_TOKEN=seu_app_token
GLPI_PETA_USER_TOKEN=seu_user_token

# GLPI GMX  
GLPI_GMX_URL=https://glpi.gmxtecnologia.com.br
GLPI_GMX_API_URL=https://glpi.gmxtecnologia.com.br/api.php/v2.1
GLPI_GMX_APP_TOKEN=seu_app_token
GLPI_GMX_USER_TOKEN=seu_user_token
GLPI_GMX_OAUTH_CLIENT_ID=seu_client_id
GLPI_GMX_OAUTH_CLIENT_SECRET=seu_client_secret

# Autenticação Alternativa (fallback)
GLPI_PETA_USER=srv_centraltickets
GLPI_PETA_PASSWORD=sua_senha
GLPI_GMX_USER=srv_centraltickets  
GLPI_GMX_PASSWORD=sua_senha

# Supabase (cache)
NEXT_PUBLIC_SUPABASE_URL=sua_url_supabase
SUPABASE_SERVICE_KEY=sua_service_key
```

## Instalação e Uso

```bash
# Instalar dependências
npm install

# Desenvolvimento
npm run dev

# Build para produção
npm run build

# Iniciar servidor produção
npm start
```

## Endpoints da API

### GET `/api/tickets`

Retorna tickets unificados das instâncias configuradas.

```json
{
  "tickets": [
    {
      "glpi_id": 12345,
      "instance": "PETA",
      "title": "Título do Ticket",
      "status": 2,
      "entity": "Empresa",
      "category": "Suporte",
      "technician": "João Silva",
      "date_opening": "2024-01-15T10:30:00Z",
      "sla_percentage_first": 45.5,
      "sla_percentage_resolve": 23.2,
      "is_overdue_first": false,
      "is_overdue_resolve": false
    }
  ],
  "fromCache": false,
  "warning": "PETA indisponivel: Connection timeout"
}
```

## Tecnologias

- **Next.js 16** com Turbopack
- **React 19** com TypeScript
- **Tailwind CSS** para estilização
- **date-fns** para cálculos de data/SLA
- **Supabase** para cache e persistência
- **SWR** para fetch com revalidação
- **Lucide React** para ícones

## Estratégia de Autenticação

1. **Session Token (REST v1)** - Se `app_token` + `user_token` (PETA/GMX)  
2. **Session Token com Credenciais** - Se `app_token` + `username` + `password` (PETA/GMX)
3. **OAuth2 (HL)** - Apenas GMX, com `client_id`/`client_secret` + `username` + `password`
4. **Degradação** - Continua com outras instâncias se uma falhar

## Métricas e SLA

- **Primeiro Atendimento**: Tempo entre abertura e primeira ação
- **Resolução**: Tempo entre abertura e solução
- **Alerta**: Percentual ≥ 70% (configurável)
- **Waiting Time**: Subtraído do cálculo de SLA

## Deploy

O sistema está pronto para deploy em Vercel, Railway ou qualquer plataforma Next.js.
