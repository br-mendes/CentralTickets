'use client'

import type { Ticket } from '@/types/glpi'
import { calculateSLA } from '@/lib/sla/calculator'
import { SlaIndicator } from './sla-indicator'

export function TicketCard({ ticket }: { ticket: Ticket }) {
  const sla = calculateSLA(ticket)
  const percent = Math.max(sla.percentual_primeira_resposta, sla.percentual_solucao)
  const critical = percent >= 70

  const cardClass = "rounded-lg border p-4 border-l-4 " + (critical ? "border-l-red-500 bg-red-50" : "border-l-green-500 bg-green-50")

  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-gray-600 mb-1">{ticket.instance} · #{ticket.glpi_id}</div>
          <div className="font-semibold text-gray-900 truncate">{ticket.title}</div>
        </div>
        <SlaIndicator percentage={percent} />
      </div>
      <div className="mt-3 text-xs text-gray-600">
        Primeira resposta: <span className={critical ? "text-red-700 font-semibold" : "text-green-700 font-semibold"}>{sla.sla_primeira_resposta_status}</span>
      </div>
    </div>
  )
}
