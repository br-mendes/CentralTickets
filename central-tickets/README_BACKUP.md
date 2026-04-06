# Central de Tickets - Sistema de Backup

## Variáveis de Ambiente

As credenciais da API são configuradas via Environment Variables na Vercel. **Não estão mais no código.**

### Configurar na Vercel

1. Acesse https://vercel.com/dashboard
2. Selecione o projeto CentralTickets
3. Vá em **Settings** → **Environment Variables**
4. Adicione as seguintes variáveis:

| Nome | Valor (exemplo) |
|------|-----------------|
| PETA_BASE_URL | https://glpi.petacorp.com.br/apirest.php |
| PETA_USER_TOKEN | seu_token_peta |
| PETA_APP_TOKEN | seu_app_token_peta |
| GMX_BASE_URL | https://glpi.gmxtecnologia.com.br/apirest.php |
| GMX_USER_TOKEN | seu_token_gmx |
| GMX_APP_TOKEN | seu_app_token_gmx |

5. Clique **Save**
6. Faça um novo deploy (Settings → Deployments → Redeploy)

## Sistema de Cache Automático

- Dados são salvos no localStorage após cada atualização
- Ao abrir a página, dados em cache são carregados instantaneamente
- A página atualiza em background para manter sincronizado

## Botões do Header

| Ícone | Função |
|-------|--------|
| ⬇️ | Exportar dados para JSON |
| ⬆️ | Importar dados de JSON |
| 🗑️ | Limpar cache |

## Exportar/Importar Dados

### Exportar
1. Clique no botão ⬇️
2. Arquivo será baixado como `tickets_backup_YYYY-MM-DD.json`

### Importar
1. Clique no botão ⬆️
2. Selecione o arquivo `.json`
3. Confirme a importação

## Abrir no Excel

1. Abra o Excel
2. **Dados** → **Obter Dados** → **De Arquivo** → **De JSON**
3. Selecione o arquivo exportado
4. No Power Query, clique "Para Tabela" → "Fechar e Carregar"

## Estrutura do Backup JSON

```json
{
  "exportedAt": "2024-01-15T10:30:00.000Z",
  "totalTickets": 150,
  "tickets": [...]
}
```
