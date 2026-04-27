'use client'
import { useEffect, useState, useCallback } from 'react'
import { fetchAllTickets } from '../lib/tickets-api'
import { useFilters } from '../context/FilterContext'
import { processEntity, fmt, formatWaitTime, calcHoursAgo } from '../lib/utils'
import InstanceBadge from '../components/InstanceBadge'
import SLABadge from '../components/SLABadge'

const COLUMNS = [
  { keys: ['processing'],       label: 'Em Atendimento', color: '#22c55e' },
  { keys: ['pending-approval'], label: 'Aprovação',      color: '#7c3aed' },
  { keys: ['pending'],          label: 'Pendente',       color: '#f97316' },
  { keys: ['solved'],           label: 'Solucionado',    color: '#6b7280' },
  { keys: ['closed'],           label: 'Fechado',        color: '#1f2937' },
]

const INITIAL = 50
const STEP    = 50
const KANBAN_STATUSES = 'new,processing,pending,pending-approval,solved,closed'

function TicketCard({ t }) {
  const isLate = t.is_sla_late || t.is_overdue_resolve
  const isPending = t.status_key === 'pending'
  const waitH = isPending ? calcHoursAgo(t.date_mod) : 0

  return (
    <div className="ticket-card" style={{ 
      borderColor: isLate ? '#ef4444' : 'var(--border)' 
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'nowrap' }}>
        <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.82rem', flexShrink: 0 }}>#{t.ticket_id}</span>
        <span style={{ flexShrink: 0 }}><InstanceBadge instance={t.instance} /></span>
      </div>

      {t.title && (
        <div style={{ fontSize: '0.75rem', fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.3, marginTop: '2px' }}>
          {t.title}
        </div>
      )}

      {t.entity && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {processEntity(t.entity)}
        </div>
      )}

      {t.category && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.category}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '4px', gap: '4px' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
          {t.technician_name || t.technician || <em>Sem técnico</em>}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>{fmt(t.date_created)}</span>
      </div>

      {isPending && waitH > 0 && (
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: waitH >= 72 ? '#dc2626' : waitH >= 24 ? '#ea580c' : 'var(--text-secondary)' }}>
          Esperando: {formatWaitTime(waitH)}
        </div>
      )}

      {isLate && <SLABadge isLate={true} />}
    </div>
  )
}

function KanbanColumn({ col, allTickets, filterInstance }) {
  const [shown, setShown] = useState(INITIAL)

  const colTickets = allTickets.filter(t => col.keys.includes(t.status_key))
  const visible = filterInstance
    ? colTickets.filter(t => (t.instance || '').toUpperCase() === filterInstance)
    : colTickets

  const cards = visible.slice(0, shown)
  const remaining = visible.length - shown

  return (
    <div className="kanban-column">
      {/* Column header */}
      <div className="kanban-column-header" style={{ 
        background: col.color + '1a', 
        border: `1px solid ${col.color}44` 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: col.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{col.label}</span>
        </div>
        <span style={{ background: col.color, color: '#fff', borderRadius: '9999px', padding: '1px 7px', fontSize: '0.72rem', fontWeight: 700 }}>
          {visible.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', paddingBottom: '4px' }}>
        {cards.map(t => <TicketCard key={`${t.ticket_id}-${t.instance}`} t={t} />)}

        {remaining > 0 && (
          <button onClick={() => setShown(s => s + STEP)} style={{
            padding: '8px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)',
            background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem',
          }}>
            + {remaining} mais
          </button>
        )}

        {visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Nenhum ticket</div>
        )}
      </div>
    </div>
  )
}

export default function KanbanPage() {
  const { applyFilters, setAvailableTechnicians } = useFilters()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [fInstance, setFInstance] = useState('')

  const sel = {
    padding: '6px 10px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)', background: 'var(--background)',
    color: 'var(--text-primary)', fontSize: '0.82rem',
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const result = await fetchAllTickets({ instance: 'PETA,GMX', statuses: KANBAN_STATUSES })
      const all = result?.data || []
      setTickets(all)
      setLastUpdate(new Date())
      const techs = [...new Set(all.map(t => t.technician).filter(Boolean))].sort()
      setAvailableTechnicians(techs)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [setAvailableTechnicians])

  useEffect(() => {
    load()
    const iv = setInterval(load, 10 * 60 * 1000)
    return () => clearInterval(iv)
  }, [load])

  const filtered = applyFilters(tickets)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Kanban</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Visão por status — todos os tickets</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={fInstance} onChange={e => setFInstance(e.target.value)} style={sel}>
            <option value="">Todas as instâncias</option>
            <option value="PETA">Peta</option>
            <option value="GMX">GMX</option>
          </select>
          {lastUpdate && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}</span>}
          <button onClick={load} className="btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {COLUMNS.map(col => {
          const colTickets = filtered.filter(t => col.keys.includes(t.status_key))
          const visible = fInstance ? colTickets.filter(t => (t.instance || '').toUpperCase() === fInstance) : colTickets
          return (
            <div key={col.label} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 10px', borderRadius: 'var(--radius-md)',
              background: col.color + '15', border: `1px solid ${col.color}44`, fontSize: '0.8rem',
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: col.color }} />
              <span style={{ color: 'var(--text-secondary)' }}>{col.label}:</span>
              <span style={{ fontWeight: 700, color: col.color }}>{visible.length}</span>
            </div>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}><div className="spinner" /></div>
      ) : error ? (
        <div style={{ color: '#dc2626', padding: '16px' }}>Erro: {error}</div>
      ) : (
        <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '20px', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          {COLUMNS.map(col => (
            <KanbanColumn key={col.label} col={col} allTickets={filtered} filterInstance={fInstance} />
          ))}
        </div>
      )}
    </div>
  )
}
