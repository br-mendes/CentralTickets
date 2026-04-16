// app/tickets/[id]/page.js
import { getSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

// Marcar como página dinâmica (forçar renderização no servidor)
export const dynamic = 'force-dynamic'

// Server Component para buscar dados do ticket

export default async function TicketPage({ params }) {
  const supabase = getSupabaseServerClient()
  const { id } = params

  // Busca dados do ticket no Supabase
  const { data: ticket, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return <div className="text-red-500">Erro ao carregar ticket: {error.message}</div>
  }

  if (!ticket) {
    return <div className="text-gray-500">Ticket não encontrado</div>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ticket #{ticket.id}</h1>
      <div className="bg-white p-4 rounded shadow">
        <p><strong>Título:</strong> {ticket.title}</p>
        <p><strong>Descrição:</strong> {ticket.description}</p>
        <p><strong>Status:</strong> {ticket.status}</p>
        <p><strong>Criado em:</strong> {new Date(ticket.created_at).toLocaleString()}</p>
      </div>
      <Link
        href="/tickets"
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 inline-block"
      >
        Voltar para a lista
      </Link>
    </div>
  )
}