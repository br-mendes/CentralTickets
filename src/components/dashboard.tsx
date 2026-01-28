'use client'

import useSWR from 'swr'
import type { Ticket } from '@/types/glpi'
import { TicketGrid } from '@/components/tickets/ticket-grid'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Erro ao carregar tickets")
  return res.json()
}

export function Dashboard() {
  const { data, error, isLoading, mutate } = useSWR<{ tickets: Ticket[]; fromCache?: boolean; warning?: string }>('/api/tickets', fetcher, { refreshInterval: 120000 })
  const tickets = data?.tickets ?? []

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Central de Tickets</h1>
            <p className="text-zinc-600">PETA + GMX em uma tela</p>
            {data?.warning && <p className="text-xs text-amber-700 mt-1">{data.warning}</p>}
          </div>
          <button className="px-3 py-2 rounded-md bg-zinc-900 text-white text-sm" onClick={() => mutate()}>Atualizar</button>
        </div>

        {error ? (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">{String(error)}</div>
        ) : (
          <TicketGrid tickets={tickets} isLoading={isLoading} />
        )}
      </div>
    </div>
  )
}
