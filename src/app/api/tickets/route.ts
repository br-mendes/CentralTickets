import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getInstanceEnvs, fetchTicketsForInstance } from '@/lib/glpi'
import { computeSlaPercent } from '@/lib/sla'
import type { Ticket, GlpiTicket } from '@/types/glpi'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY
    let warning: string | undefined

    const appendWarning = (msg: string) => {
      warning = warning ? warning + '; ' + msg : msg
    }

    const supabase = hasSupabase ? getSupabaseAdmin() : null
    if (!hasSupabase) {
      appendWarning('Missing Supabase env (returning live GLPI data only)')
    }

    if (supabase) {
      const cacheTimestamp = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const { data: cached } = await supabase
        .from('tickets')
        .select('*')
        .gte('updated_at', cacheTimestamp)
        .order('updated_at', { ascending: false })

      if (cached && cached.length > 0) {
        return NextResponse.json({ tickets: cached, fromCache: true, warning })
      }
    }

    const tickets: GlpiTicket[] = []

    // Get configured instances and fetch tickets from each
    const instances = getInstanceEnvs()
    
    for (const instanceEnv of instances) {
      try {
        const rawTickets = await fetchTicketsForInstance(instanceEnv)
        
        // Calculate SLA for each ticket
        const ticketsWithSla = rawTickets.map((ticket) => {
          const slaFirst = computeSlaPercent({
            startISO: ticket.date_opening,
            endISO: ticket.date_takeaccount,
            allowedSeconds: ticket.internal_time_to_own,
            waitingSeconds: ticket.waiting_duration,
          });

          const slaResolve = computeSlaPercent({
            startISO: ticket.date_opening,
            endISO: ticket.date_solve || ticket.date_close,
            allowedSeconds: ticket.internal_time_to_resolve,
            waitingSeconds: ticket.waiting_duration,
          });

          return {
            ...ticket,
            sla_percentage_first: slaFirst.percent,
            sla_percentage_resolve: slaResolve.percent,
            is_overdue_first: slaFirst.overdue,
            is_overdue_resolve: slaResolve.overdue,
          };
        });
        
        tickets.push(...ticketsWithSla)
      } catch (e) {
        appendWarning(`${instanceEnv.instance} indisponivel: ${String(e)}`)
      }
    }

    if (supabase && tickets.length > 0) {
      await supabase.from('tickets').upsert(tickets)
    }

    return NextResponse.json({ tickets, fromCache: false, warning })
  } catch (e) {
    return NextResponse.json({ tickets: [], error: String(e) }, { status: 200 })
  }
}
