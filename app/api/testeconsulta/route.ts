import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Configuração incompleta. Verifique as variáveis de ambiente.' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('tickets_cache')
      .select('*')
      .order('date_mod', { ascending: false })
      .limit(5)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { message: 'Nenhum ticket encontrado no cache', data: [] }
      )
    }

    // Return first ticket with all fields
    const sample = data[0]
    const fields = Object.keys(sample).map(key => ({
      field: key,
      type: typeof sample[key],
      value: sample[key],
      isNull: sample[key] === null,
      isEmpty: sample[key] === '',
    }))

    return NextResponse.json({
      total_tickets: data.length,
      sample_ticket_id: sample.ticket_id,
      instance: sample.instance,
      fields: fields,
      all_tickets: data.map(t => ({
        ticket_id: t.ticket_id,
        instance: t.instance,
        title: t.title,
        technician: t.technician,
        technician_name: t.technician_name || '(vazio)',
        requester: t.requester,
        requester_name: t.requester_name || '(vazio)',
        group_name: t.group_name || '(vazio)',
        status_key: t.status_key,
        status_name: t.status_name,
        is_sla_late: t.is_sla_late,
        is_overdue_first: t.is_overdue_first,
        is_overdue_resolve: t.is_overdue_resolve,
        sla_percentage_first: t.sla_percentage_first,
        sla_percentage_resolve: t.sla_percentage_resolve,
      }))
    })

  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || String(e) },
      { status: 500 }
    )
  }
}
