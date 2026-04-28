import { getSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import StatusBadge from '../../components/StatusBadge'
import InstanceBadge from '../../components/InstanceBadge'
import SLABadge from '../../components/SLABadge'
import { processEntity, lastGroupLabel, fmt } from '../../lib/utils'

export const dynamic = 'force-dynamic'

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <dt style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</dt>
      <dd style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{children ?? '—'}</dd>
    </div>
  )
}

export default async function TicketDetailPage({ params, searchParams }) {
  const { id } = params
  const instanceParam = (searchParams?.instance || '').toUpperCase()
  const instances = instanceParam ? [instanceParam] : ['PETA', 'GMX']
  let ticket = null
  let fetchError = null

  try {
    const { data, error } = await getSupabaseServerClient()
      .from('tickets_cache')
      .select('*')
      .eq('ticket_id', id)
      .in('instance', instances)
      .order('date_mod', { ascending: false })

    if (error) { fetchError = error.message }
    else if (data && data.length > 0) { ticket = data[0] }
  } catch (e) { fetchError = e.message }

  if (fetchError) return (
    <div>
      <Link href="/tickets" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>← Voltar</Link>
      <div style={{ marginTop: '16px', color: '#dc2626' }}>Erro: {fetchError}</div>
    </div>
  )

  if (!ticket) return (
    <div>
      <Link href="/tickets" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>← Voltar</Link>
      <div style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Ticket não encontrado.</div>
    </div>
  )

  const isLate = ticket.is_sla_late || ticket.is_overdue_resolve

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '900px' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <Link href="/tickets" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.85rem' }}>← Tickets Ativos</Link>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <InstanceBadge instance={ticket.instance} />
          <SLABadge isLate={isLate} />
        </div>
      </div>

      {/* Title */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Ticket #{ticket.ticket_id}</h1>
          <StatusBadge statusId={ticket.status_id} statusKey={ticket.status_key} statusName={ticket.status_name} />
        </div>
        {ticket.title && <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{ticket.title}</p>}
      </div>

      {/* Details grid */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '22px' }}>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '18px' }}>
          <Field label="Entidade">{processEntity(ticket.entity)}</Field>
          <Field label="Categoria">{ticket.category || '—'}</Field>
          <Field label="Grupo">{lastGroupLabel(ticket.group_name)}</Field>
          <Field label="Técnico">{ticket.technician_name || ticket.technician || '—'}</Field>
          <Field label="Solicitante">{ticket.requester_name || ticket.requester || '—'}</Field>
          {(ticket.channel_name || ticket.request_source) && (
            <Field label="Origem">{ticket.channel_name || ticket.request_source}</Field>
          )}
          <Field label="Abertura">{fmt(ticket.date_created)}</Field>
          <Field label="Última Atualização">{fmt(ticket.date_mod)}</Field>
          <Field label="Prazo">{fmt(ticket.due_date)}</Field>
          {ticket.date_solved && <Field label="Solucionado em">{fmt(ticket.date_solved)}</Field>}
          {ticket.priority && <Field label="Prioridade">{ticket.priority}</Field>}
        </dl>
      </div>

      {/* Description */}
      {ticket.content && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '22px' }}>
          <h2 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Descrição</h2>
          <div style={{ color: 'var(--text-primary)', lineHeight: 1.6, fontSize: '0.9rem' }}
            dangerouslySetInnerHTML={{ __html: ticket.content }} />
        </div>
      )}

      {/* Solution */}
      {ticket.solution && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid #22c55e', borderRadius: 'var(--radius-lg)', padding: '22px' }}>
          <h2 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Solução</h2>
          <div style={{ color: 'var(--text-primary)', lineHeight: 1.6, fontSize: '0.9rem' }}
            dangerouslySetInnerHTML={{ __html: ticket.solution }} />
        </div>
      )}
    </div>
  )
}
