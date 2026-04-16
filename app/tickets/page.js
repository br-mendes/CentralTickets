// app/tickets/page.js
import { getSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

// Marcar como página dinâmica (forçar renderização no servidor)
export const dynamic = 'force-dynamic'

// Server Component para listar todos os tickets

export default async function TicketsPage() {
  const supabase = getSupabaseServerClient()
  
  // Busca todos os tickets
  const { data: tickets, error } = await supabase
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return <div className="text-red-500">Erro ao carregar tickets: {error.message}</div>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Todos os Tickets</h1>
      <Link
        href="/tickets/new"
        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 inline-block mb-4"
      >
        + Novo Ticket
      </Link>
      <div className="bg-white p-4 rounded shadow">
        <ul className="space-y-2">
          {tickets.map(ticket => (
            <li key={ticket.id} className="border-b pb-2">
              <Link
                href={`/tickets/${ticket.id}`}
                className="text-blue-500 hover:underline font-medium"
              >
                {ticket.title}
              </Link>
              <p className="text-gray-600 text-sm">{ticket.status}</p>
              <p className="text-gray-500 text-xs">ID: {ticket.id}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}