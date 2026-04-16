'use client'
import { useEffect, useState, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import InstanceBadge from '../components/InstanceBadge'
import SLABadge from '../components/SLABadge'

const COLUMNS = [
  { id: 2, key: 'processing', label: 'Em Atendimento', color: 'var(--status-processing)' },
  { id: 7, key: 'approval', label: 'Aprovação', color: 'var(--status-approval)' },
  { id: 4, key: 'pending', label: 'Pendente', color: 'var(--status-pending)' },
  { id: 5, key: 'solved', label: 'Solucionado', color: 'var(--status-solved)' },
]

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function TicketCard({ ticket }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${ticket.is_sla_late ? 'var(--sla-late)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-md)',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.85rem' }}>#{ticket.ticket_id}</span>
        <InstanceBadge instance={ticket.instance} />
      </div>
      {ticket.title && (
        <div style={{
          fontSize: '0.82rem',
          color: 'var(--text-primary)',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          lineHeight: '1.4',
        }}>
          {ticket.title}
        </div>
      )}
      {ticket.entity && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.entity}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        {ticket.technician ? (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ticket.technician}</span>
        ) : (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem técnico</span>
        )}
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{fmt(ticket.date_created)}</span>
      </div>
      {ticket.is_sla_late && (
        <SLABadge isLate={true} />
      )}
    </div>
  )
}

function KanbanColumn({ column, tickets, filterInstance }) {
  const [showAll, setShowAll] = useState(false)
  const filtered = filterInstance
    ? tickets.filter(t => (t.instance || '').toLowerCase() === filterInstance.toLowerCase())
    : tickets
  const visible = showAll ? filtered : filtered.slice(0, 30)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '260px', flex: 1 }}>
      {/* Column header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: column.color + '18',
        border: `1px solid ${column.color}44`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: column.color }} />
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{column.label}</span>
        </div>
        <span style={{
          background: column.color,
          color: 'white',
          borderRadius: '9999px',
          padding: '2px 8px',
          fontSize: '0.75rem',
          fontWeight: 700,
        }}>
          {filtered.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
        {visible.map(t => <TicketCard key={t.ticket_id} ticket={t} />)}
        {!showAll && filtered.length > 30 && (
          <button onClick={() => setShowAll(true)} style={{
            padding: '8px',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--border)',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: '0.82rem',
          }}>
            + {filtered.length - 30} mais
          </button>
        )}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Nenhum ticket
          </div>
        )}
      </div>
    </div>
  )
}

export default function KanbanPage() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterInstance, setFilterInstance] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error: err } = await supabase
        .from('tickets_cache')
        .select('ticket_id,title,entity,status_id,status_key,date_created,due_date,is_sla_late,technician,instance')
        .in('status_id', [2, 4, 5, 7])
        .order('date_mod', { ascending: false })

      if (err) throw err
      setTickets(data || [])
      setLastUpdate(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  const byStatus = (statusId) => tickets.filter(t => Number(t.status_id) === statusId)

  const inputStyle = {
    padding: '7px 12px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)', background: 'var(--background)',
    color: 'var(--text-primary)', fontSize: '0.85rem',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>Kanban</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Visão por status dos tickets ativos</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={filterInstance} onChange={e => setFilterInstance(e.target.value)} style={inputStyle}>
            <option value="">Todas as instâncias</option>
            <option value="peta">Peta</option>
            <option value="gmx">GMX</option>
          </select>
          {lastUpdate && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}</span>}
          <button onClick={load} style={{ ...inputStyle, cursor: 'pointer', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 600 }}>
            Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Carregando kanban...</div>
      ) : error ? (
        <div style={{ color: 'var(--sla-late)', padding: '16px' }}>Erro: {error}</div>
      ) : (
        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px', alignItems: 'flex-start' }}>
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.id}
              column={col}
              tickets={byStatus(col.id)}
              filterInstance={filterInstance}
            />
          ))}
        </div>
      )}
    </div>
  )
}
