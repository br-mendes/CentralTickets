'use client'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { fetchTicketsPage } from '../lib/tickets-api'
import { useFilters } from '../context/FilterContext'
import { processEntity, lastGroupLabel, fmt, calcHoursAgo, formatWaitTime } from '../lib/utils'
import StatusBadge from '../components/StatusBadge'
import InstanceBadge from '../components/InstanceBadge'
import SLABadge from '../components/SLABadge'

const PAGE_SIZE = 1000
const OPEN_STATUSES = 'new,processing,pending,pending-approval'
const ALL_INSTANCES = 'PETA'

const sel = {
  padding: '7px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
}

function TicketsContent() {
  const { applyFilters, setAvailableTechnicians } = useFilters()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState(null)
  const [totalTickets, setTotalTickets] = useState(0)
  const hasData = useRef(false)

  const [search, setSearch] = useState('')
  const [fInstance, setFInstance] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fSLA, setFSLA] = useState('')
  const [fGroup, setFGroup] = useState('')
  const [fEntity, setFEntity] = useState('')
  const [fUrgency, setFUrgency] = useState('')

  const instanceFilter = fInstance ? fInstance.toUpperCase() : ALL_INSTANCES

  // Fix: Ensure single instance only (PETA or GMX, not both)
  const safeInstance = instanceFilter.includes(',') ? instanceFilter.split(',')[0].trim() : instanceFilter

  const load = useCallback(async (reset = true) => {
    if (!hasData.current || reset) setLoading(true)
    setError(null)
    try {
      const result = await fetchTicketsPage({
        instance: safeInstance,
        statuses: OPEN_STATUSES,
        cursor: null,
        limit: PAGE_SIZE,
      })
      const tickets = result?.tickets || []

      setTickets(tickets)
      setHasMore(result.hasMore)
      setNextCursor(result.nextCursor)
      setTotalTickets(tickets.length)
      hasData.current = true
      setLastUpdate(new Date())
      const techs = [...new Set(tickets.map(t => t.technician).filter(Boolean))].sort()
      const requesters = [...new Set(tickets.map(t => t.requester_name || t.requester).filter(Boolean))].sort()
      setAvailableTechnicians(techs)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [instanceFilter, setAvailableTechnicians])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return

    setLoadingMore(true)
    setError(null)

    try {
      const result = await fetchTicketsPage({
        instance: safeInstance,
        statuses: OPEN_STATUSES,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      })

      const pageData = result?.tickets || []

      setTickets(prev => {
        const map = new Map(prev.map(t => [`${t.ticket_id}-${t.instance}`, t]))
        pageData.forEach(t => map.set(`${t.ticket_id}-${t.instance}`, t))
        const merged = Array.from(map.values())
        const techs = [...new Set(merged.map(t => t.technician).filter(Boolean))].sort()
        setAvailableTechnicians(techs)
        return merged
      })

      setHasMore(result.hasMore)
      setNextCursor(result.nextCursor)
      setTotalTickets(totalTickets + pageData.length)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, instanceFilter, loadingMore, nextCursor, setAvailableTechnicians, totalTickets])

  useEffect(() => {
    load(true)

    // Polling periódico: reinicia da primeira página
    const iv = setInterval(() => load(true), 3 * 60 * 1000)

    return () => {
      clearInterval(iv)
    }
  }, [instanceFilter, load])

  const filtered = applyFilters(tickets).filter(t => {
    if (fInstance && (t.instance || '').toUpperCase() !== fInstance.toUpperCase()) return false
    if (fStatus  && t.status_key !== fStatus) return false
    if (fSLA === 'late' && !(t.is_sla_late || t.is_overdue_resolve)) return false
    if (fSLA === 'ok'   &&  (t.is_sla_late || t.is_overdue_resolve)) return false
    if (fGroup   && lastGroupLabel(t.group_name) !== fGroup) return false
    if (fEntity  && processEntity(t.entity) !== fEntity) return false
    if (fUrgency && String(t.urgency) !== fUrgency) return false
    if (search) {
      const s = search.toLowerCase()
      const req = (t.requester_name || t.requester || '').toLowerCase()
      if (!String(t.ticket_id).includes(s) && !(t.title || '').toLowerCase().includes(s) && !processEntity(t.entity).toLowerCase().includes(s) && !req.includes(s)) return false
    }
    return true
  })

  const groups   = [...new Set(tickets.map(t => lastGroupLabel(t.group_name)).filter(v => v !== '—'))].sort()
  const entities = [...new Set(tickets.map(t => processEntity(t.entity)).filter(v => v !== '—'))].sort()
  const late     = filtered.filter(t => t.is_sla_late || t.is_overdue_resolve).length
  const proc     = filtered.filter(t => t.status_key === 'processing').length
  const pend     = filtered.filter(t => t.status_key === 'pending').length
  const approval = filtered.filter(t => t.status_key === 'pending-approval').length
  const critical = filtered.filter(t => (t.urgency || 0) >= 5).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Monitor.Tickets</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Novo • Em atendimento • Pendente • Aprovação</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {lastUpdate && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}</span>}
          <button onClick={() => load(true)} className="btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[
          { label: 'Em atendimento', v: proc,            color: '#16a34a' },
          { label: 'Pendentes',      v: pend,            color: '#ea580c' },
          { label: 'Aprovação',      v: approval,        color: '#7c3aed' },
          { label: 'SLA Excedido',   v: late,            color: '#dc2626' },
          { label: 'Urgência Alta+', v: critical,        color: '#b91c1c' },
          { label: 'Total filtrado', v: filtered.length, color: 'var(--text-secondary)' },
        ].map(s => (
          <div key={s.label} style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            padding: '5px 12px', borderRadius: 'var(--radius-md)',
            background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.82rem',
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{s.label}:</span>
            <span style={{ fontWeight: 700, color: s.color }}>{s.v}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '14px',
        display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <input placeholder="Buscar ID, título, entidade, solicitante..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ ...sel, minWidth: '220px', flex: 1 }} />

        <select value={fInstance} onChange={e => setFInstance(e.target.value)} style={sel}>
          <option value="">Todas as instâncias</option>
          <option value="PETA">Peta</option>
          <option value="GMX">GMX</option>
        </select>

        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={sel}>
          <option value="">Todos os status</option>
          <option value="new">Novo</option>
          <option value="processing">Em atendimento</option>
          <option value="pending">Pendente</option>
          <option value="pending-approval">Aprovação</option>
        </select>

        <select value={fUrgency} onChange={e => setFUrgency(e.target.value)} style={sel}>
          <option value="">Toda urgência</option>
          <option value="6">Crítica</option>
          <option value="5">Muito Alta</option>
          <option value="4">Alta</option>
          <option value="3">Média</option>
          <option value="2">Baixa</option>
          <option value="1">Muito Baixa</option>
        </select>

        <select value={fSLA} onChange={e => setFSLA(e.target.value)} style={sel}>
          <option value="">Todos os SLA</option>
          <option value="late">SLA Excedido</option>
          <option value="ok">No Prazo</option>
        </select>

        <select value={fGroup} onChange={e => setFGroup(e.target.value)} style={{ ...sel, maxWidth: '160px' }}>
          <option value="">Todos os grupos</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <select value={fEntity} onChange={e => setFEntity(e.target.value)} style={{ ...sel, maxWidth: '160px' }}>
          <option value="">Todas as entidades</option>
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>

        <button onClick={() => setFSLA('late')} style={{ ...sel, cursor: 'pointer', background: fSLA === 'late' ? '#fee2e2' : undefined, color: '#dc2626', fontWeight: 600 }}>SLA fora</button>
        <button onClick={() => setFStatus('pending')} style={{ ...sel, cursor: 'pointer', background: fStatus === 'pending' ? '#fff7ed' : undefined, color: '#ea580c', fontWeight: 600 }}>Pendentes</button>
        <button onClick={() => setFStatus('pending-approval')} style={{ ...sel, cursor: 'pointer', background: fStatus === 'pending-approval' ? '#f3e8ff' : undefined, color: '#7c3aed', fontWeight: 600 }}>Aprovação</button>
        <button onClick={() => { setSearch(''); setFInstance(''); setFStatus(''); setFSLA(''); setFGroup(''); setFEntity(''); setFUrgency('') }}
          style={{ ...sel, cursor: 'pointer' }}>Limpar</button>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
          {filtered.length} resultados carregados ({tickets.length}/{totalTickets || tickets.length})
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}><div className="spinner" /></div>
      ) : error ? (
        <div style={{ color: '#dc2626', padding: '16px' }}>Erro: {error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>Nenhum ticket encontrado.</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                  {['ID', 'Instância', 'Entidade', 'Status', 'Grupo', 'Técnico', 'Abertura', 'Últ. Atualização', 'Previsto', 'SLA'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const isLate = t.is_sla_late || t.is_overdue_resolve
                  return (
                    <tr key={`${t.ticket_id}-${t.instance}`}
                      className={isLate ? 'sla-late' : ''}
                      style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>#{t.ticket_id}</span>
                        {t.title && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>}
                      </td>
                      <td style={{ padding: '9px 12px' }}><InstanceBadge instance={t.instance} /></td>
                      <td className="col-entity" style={{ padding: '9px 12px' }}>{processEntity(t.entity)}</td>
                      <td style={{ padding: '9px 12px' }}><StatusBadge statusId={t.status_id} statusKey={t.status_key} statusName={t.status_name} /></td>
                      <td className="col-group" style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>
                        {lastGroupLabel(t.group_name) !== '—' ? lastGroupLabel(t.group_name) : <em style={{ color: 'var(--text-muted)' }}>Sem grupo</em>}
                      </td>
                      <td className="col-technician" style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>
                        {t.technician_name || t.technician || <em style={{ color: 'var(--text-muted)' }}>Sem técnico</em>}
                      </td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_created)}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{formatWaitTime(calcHoursAgo(t.date_mod))}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.due_date)}</td>
                      <td style={{ padding: '9px 12px' }}><SLABadge isLate={isLate} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{ ...sel, cursor: loadingMore ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              >
                {loadingMore ? 'Carregando...' : 'Carregar mais tickets'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function TicketsAtivosPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}><div className="spinner" /></div>}>
      <TicketsContent />
    </Suspense>
  )
}
