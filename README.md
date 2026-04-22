# CentralTickets

Projeto principal em Next.js (App Router).

## Estrutura ativa

- `app/`: frontend e rotas de API do Next.js
- `lib/`: configuracao e clientes Supabase
- `supabase/functions/`: Edge Functions de sincronizacao GLPI (`sync-peta` e `sync-gmx`)

## Observacao

Os artefatos legados em HTML estatico foram removidos para evitar deploy acidental fora do fluxo Next.js.
