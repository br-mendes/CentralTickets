// app/glpi/[source]/tickets/page.js
import config from '../../../lib/config'

// Marcar como página dinâmica (forçar renderização no servidor)
export const dynamic = 'force-dynamic'

// Server Component para buscar tickets do GLPI

export default async function GLPITickets({ params }) {
  const { source } = params
  const glpiUrl = source === 'peta' ? config.glpi.petaUrl : config.glpi.gmxUrl

  // Busca tickets do GLPI
  let tickets = []
  try {
    const response = await fetch(`${glpiUrl}/tickets`, {
      headers: {
        'Content-Type': 'application/json',
        // Adicione tokens de autenticação se necessário
        ...(config.glpi.tokens[`${source}App`] && {
          'X-GLPI-App-Token': config.glpi.tokens[`${source}App`],
        }),
        ...(config.glpi.tokens[`${source}User`] && {
          'X-GLPI-User-Token': config.glpi.tokens[`${source}User`],
        }),
      },
    })

    if (!response.ok) {
      throw new Error(`Falha ao buscar tickets: ${response.status}`)
    }

    tickets = await response.json()
  } catch (error) {
    return <div className="text-red-500">Erro ao carregar tickets: {error.message}</div>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tickets do GLPI ({source})</h1>
      <div className="bg-white p-4 rounded shadow">
        <ul className="space-y-2">
          {tickets.map(ticket => (
            <li key={`${ticket.id}-${source.toUpperCase()}`} className="border-b pb-2">
              <a
                href={`/tickets/${ticket.id}?instance=${source.toUpperCase()}`}
                className="text-blue-500 hover:underline"
              >
                {ticket.title} (ID: {ticket.id})
              </a>
            </li>
          ))}
        </ul>
      </div>
      <a
        href="/"
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 inline-block"
      >
        Voltar para o início
      </a>
    </div>
  )
}
