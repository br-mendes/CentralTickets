# Central de Tickets - Sistema de Backup

## Visão Geral

O sistema de backup permite salvar e restaurar os dados dos tickets localmente, garantindo carregamento rápido mesmo quando a API não está disponível.

## Funcionalidades

### Cache Automático
- Os dados são salvos automaticamente no localStorage do navegador após cada atualização
- Ao abrir a página, os dados em cache são carregados instantaneamente
- A página atualiza em background para manter os dados sincronizados

### Botões do Header

| Ícone | Função |
|-------|--------|
| ⬇️ | Exportar dados para arquivo JSON |
| ⬆️ | Importar dados de arquivo JSON |
| 🗑️ | Limpar cache local |

## Como Exportar Dados

1. Clique no botão de exportar (⬇️) no header
2. O arquivo será baixado com o nome `tickets_backup_YYYY-MM-DD.json`
3. Salve o arquivo em local seguro

## Como Importar Dados

1. Clique no botão de importar (⬆️) no header
2. Selecione o arquivo `.json` previamente exportado
3. Confirme a importação quando solicitado
4. Os dados serão carregados e salvos no cache

## Como Abrir no Excel

### Método 1: Power Query (Recomendado)
1. Abra o Microsoft Excel
2. Vá em **Dados** → **Obter Dados** → **De Arquivo** → **De JSON**
3. Selecione o arquivo `.json` exportado
4. No Power Query Editor:
   - Clique em "Para Tabela" na coluna tickets
   - Expanda as colunas clicando nos botões de filtro
   - Selecione os campos desejados
5. Clique em **Fechar e Carregar**

### Método 2: Conversão Simples
1. Renomeie o arquivo de `.json` para `.csv`
2. Abra no Excel (pode não funcionar com todos os arquivos)

## Estrutura do Arquivo JSON

```json
{
  "exportedAt": "2024-01-15T10:30:00.000Z",
  "totalTickets": 150,
  "instances": {
    "peta": 100,
    "gmx": 50
  },
  "tickets": [
    {
      "id": 1234,
      "title": "Título do ticket",
      "entity": "Nome do Cliente",
      "category": "Suporte",
      "status": "processing",
      "statusName": "Em atendimento",
      "dateCreated": "2024-01-10T08:00:00.000Z",
      "instance": "Peta"
    }
  ]
}
```

## Campos Disponíveis

| Campo | Descrição |
|-------|-----------|
| `id` | ID único do ticket |
| `title` | Título/assunto do ticket |
| `entity` | Entidade/cliente |
| `category` | Categoria do ticket |
| `status` | Status (new, processing, pending, solved, closed) |
| `statusName` | Nome descritivo do status |
| `dateCreated` | Data de criação |
| `dueDate` | Data limite/SLA |
| `instance` | Instância (Peta ou GMX) |

## Limitações

- O cache localStorage tem limite de ~5-10MB dependendo do navegador
- Dados muito grandes podem não ser salvos completamente
- Recomenda-se exportar regularmente para backup externo

## Solução de Problemas

### "Nenhum ticket para exportar"
- A página precisa ter carregado dados da API primeiro
- Tente atualizar os dados clicando no botão "Atualizar"

### "Arquivo JSON inválido"
- Verifique se o arquivo foi exportado corretamente
- Tente exportar novamente

### Cache não carrega
- O cache pode ter sido limpo acidentalmente
- Clique em "Atualizar" para recarregar da API
