'use client'
import { useEffect, useState, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useFilters } from '../context/FilterContext'
import { processEntity, fmt, formatWaitTime, calcHoursAgo } from '../lib/utils'
import InstanceBadge from '../components/InstanceBadge'
import SLABadge from '../components/SLABadge'

const COLUMNS = [
  { id: 2,  keys: ['processing'],      label: 'Em Atendimento', color: '#22c55e' },
  { id: 7,  keys: ['pending-approval'], label: 'Aprovação',      color: '#f97316' },
  { id: 4,  keys: ['pending'],          label: 'Pendente',       color: '#f97316' },
  { id: 5,  keys: ['solved'],           label: 'Solucionado',    color: '#6b7280' },
  { id: 6,  keys: ['closed'],           label: 'Fechado',        color: '#1f2937' },
]

const INITIAL = 100
const STEP    = 50

function TicketCard({ t }) {
  const isLate = t.is_sla_late || t.is_overdue_resolve
  const isPending = t.status_key === 'pending'
  const waitH = isPending ? calcHoursAgo(t.date_mod) : 0

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isLate ? '#ef4444' : 'var(--border)'}`,
      borderRadius: 'var(--radius-md)',
      padding: '11px 12px',
      display: 'flex', flexDirection: 'column', gap: '5px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.82rem' }}>#{t.ticket_id}</span>
        <InstanceBadge instance={t.instance} />
      </div>

      {t.entity && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {processEntity(t.entity)}
        </div>
      )}

      {t.category && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.category}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {t.technician || <em>Sem técnico</em>}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{fmt(t.date_created)}</span>
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

  const colTickets = allTickets.filter(t =>
    col.keys.includes(t.status_key) || Number(t.status_id) === col.id
  )
  const visible = filterInstance
    ? colTickets.filter(t => (t.instance || '').toUpperCase() === filterInstance)
    : colTickets

  const cards = visible.slice(0, shown)
  const remaining = visible.length - shown

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '250px', flex: 1 }}>
      {/* Column header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '9px 13px',
        borderRadius: 'var(--radius-md)',
        background: col.color + '1a',
        border: `1px solid ${col.color}44`,
        position: 'sticky', top: '60px', zIndex: 10,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)', paddingBottom: '4px' }}>
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
      const { data, error: err } = await getSupabaseClient()
        .from('tickets_cache')
        .select('ticket_id,title,entity,category,status_id,status_key,status_name,date_created,date_mod,due_date,is_sla_late,is_overdue_resolve,technician,instance')
        .not('status_key', 'in', '(new)')       /* 'new' não aparece no kanban */
        .order('date_mod', { ascending: false })
        .limit(500)
      if (err) throw err
      const all = data || []
      setTickets(all)
      setLastUpdate(new Date())
      const techs = [...new Set(all.map(t => t.technician).filter(Boolean))].sort()
      setAvailableTechnicians(techs)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [setAvailableTechnicians])

  useEffect(() => {
    load()
    const iv = setInterval(load, 30 * 60 * 1000)  /* 30 min */
    return () => clearInterval(iv)
  }, [load])

  const filtered = applyFilters(tickets)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Kanban</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Visão por status</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={fInstance} onChange={e => setFInstance(e.target.value)} style={sel}>
            <option value="">Todas as instâncias</option>
            <option value="PETA">Peta</option>
            <option value="GMX">GMX</option>
          </select>
          {lastUpdate && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}</span>}
          <button onClick={load} style={{ ...sel, cursor: 'pointer', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600 }}>Atualizar</button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}><div className="spinner" /></div>
      ) : error ? (
        <div style={{ color: '#dc2626', padding: '16px' }}>Erro: {error}</div>
      ) : (
        <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '16px', alignItems: 'flex-start' }}>
          {COLUMNS.map(col => (
            <KanbanColumn key={col.id} col={col} allTickets={filtered} filterInstance={fInstance} />
          ))}
        </div>
      )}
    </div>
  )
}
