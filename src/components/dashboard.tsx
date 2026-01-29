'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import type { Ticket } from '@/types/glpi'
import { TicketGrid } from '@/components/tickets/ticket-grid'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Erro ao carregar tickets")
  return res.json()
}

export function Dashboard() {
  const refreshIntervalMs = 120000
  const [nextRefreshAt, setNextRefreshAt] = useState(() => Date.now() + refreshIntervalMs)
  const [secondsRemaining, setSecondsRemaining] = useState(() => Math.ceil(refreshIntervalMs / 1000))
  const { data, error, isLoading, mutate } = useSWR<{ tickets: Ticket[]; fromCache?: boolean; warning?: string }>(
    '/api/tickets',
    fetcher,
    {
      refreshInterval: refreshIntervalMs,
      onSuccess: () => setNextRefreshAt(Date.now() + refreshIntervalMs),
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  )
  const tickets = data?.tickets ?? []

  useEffect(() => {
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000))
      setSecondsRemaining(remaining)
    }, 1000)

    return () => clearInterval(id)
  }, [nextRefreshAt])

  const countdownLabel = useMemo(() => {
    const minutes = Math.floor(secondsRemaining / 60)
    const seconds = secondsRemaining % 60
    const minutesLabel = String(minutes).padStart(2, '0')
    const secondsLabel = String(seconds).padStart(2, '0')
    return `${minutesLabel}:${secondsLabel}`
  }, [secondsRemaining])

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Central de Tickets</h1>
            <p className="text-zinc-600">PETA + GMX em uma tela</p>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <div className="px-3 py-2 rounded-md bg-white shadow-sm border border-zinc-200">
                <img
                  src="https://i.ibb.co/Xr6CrgTJ/logo-GMX-preto-1.png"
                  alt="Logo GMX"
                  className="h-6 w-auto"
                  loading="lazy"
                />
              </div>
              <div className="px-3 py-2 rounded-md bg-zinc-900 shadow-sm">
                <img
                  src="https://i.ibb.co/qLpHTnB1/logo-big-white.png"
                  alt="Logo PETA"
                  className="h-6 w-auto"
                  loading="lazy"
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Próxima atualização automática em {countdownLabel}
            </p>
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
