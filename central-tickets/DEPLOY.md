# Deploy na Vercel

## Deploy Automático (Recomendado)

1. Acesse https://vercel.com e faça login com GitHub
2. Clique em "Add New Project"
3. Importe o repositório `br-mendes/CentralTickets`
4. Configure:
   - **Framework Preset**: Other
   - **Root Directory**: ./
   - **Build Command**: (deixe vazio)
   - **Output Directory**: ./
5. Clique em "Deploy"

## Deploy via CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

## URLs

- **Produção**: https://central-tickets.vercel.app/
- **Preview**: Gerado automaticamente a cada push
