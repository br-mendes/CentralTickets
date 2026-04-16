import { getSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import StatusBadge from '../../components/StatusBadge'
import InstanceBadge from '../../components/InstanceBadge'
import SLABadge from '../../components/SLABadge'

export const dynamic = 'force-dynamic'

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function Field({ label, value, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <dt style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</dt>
      <dd style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{children ?? value ?? '—'}</dd>
    </div>
  )
}

export default async function TicketDetailPage({ params }) {
  const { id } = params

  let ticket = null
  let fetchError = null

  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('tickets_cache')
      .select('*')
      .eq('ticket_id', id)
      .single()

    if (error) fetchError = error.message
    else ticket = data
  } catch (e) {
    fetchError = e.message
  }

  if (fetchError) {
    return (
      <div>
        <Link href="/tickets" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>← Voltar</Link>
        <div style={{ marginTop: '16px', color: 'var(--sla-late)' }}>Erro ao carregar ticket: {fetchError}</div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div>
        <Link href="/tickets" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>← Voltar</Link>
        <div style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Ticket não encontrado.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <Link href="/tickets" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Voltar para Tickets
        </Link>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <InstanceBadge instance={ticket.instance} />
          <SLABadge isLate={ticket.is_sla_late} />
        </div>
      </div>

      {/* Title */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Ticket #{ticket.ticket_id}
          </h1>
          <StatusBadge statusId={ticket.status_id} statusKey={ticket.status_key} statusName={ticket.status_name} />
        </div>
        {ticket.title && (
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{ticket.title}</p>
        )}
      </div>

      {/* Details grid */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
      }}>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
          <Field label="Entidade" value={ticket.entity} />
          <Field label="Categoria" value={ticket.category} />
          <Field label="Grupo Responsável" value={ticket.group_name} />
          <Field label="Técnico" value={ticket.technician} />
          <Field label="Abertura">{fmt(ticket.date_created)}</Field>
          <Field label="Última Atualização">{fmt(ticket.date_mod)}</Field>
          <Field label="Prazo">{fmt(ticket.due_date)}</Field>
          {ticket.date_solved && <Field label="Solucionado em">{fmt(ticket.date_solved)}</Field>}
        </dl>
      </div>

      {/* Description */}
      {ticket.content && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
        }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Descrição
          </h2>
          <div
            style={{ color: 'var(--text-primary)', lineHeight: '1.6', fontSize: '0.9rem' }}
            dangerouslySetInnerHTML={{ __html: ticket.content }}
          />
        </div>
      )}

      {/* Solution */}
      {ticket.solution && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          borderLeft: '4px solid var(--status-solved)',
        }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Solução
          </h2>
          <div
            style={{ color: 'var(--text-primary)', lineHeight: '1.6', fontSize: '0.9rem' }}
            dangerouslySetInnerHTML={{ __html: ticket.solution }}
          />
        </div>
      )}
    </div>
  )
}
