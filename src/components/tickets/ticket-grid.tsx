'use client'

import type { Ticket } from '@/types/glpi'
import { TicketCard } from './ticket-card'

export function TicketGrid({ tickets, isLoading }: { tickets: Ticket[]; isLoading?: boolean }) {
  if (isLoading) return <div className="text-gray-500">Carregando...</div>
  if (!tickets || tickets.length === 0) return <div className="text-gray-500">Nenhum ticket encontrado.</div>

  return (
    <div className="grid gap-4">
      {tickets.map((t) => (
        <TicketCard key={t.instance + "-" + t.glpi_id} ticket={t} />
      ))}
    </div>
  )
}
