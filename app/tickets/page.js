'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import StatusBadge from '../components/StatusBadge'
import InstanceBadge from '../components/InstanceBadge'
import SLABadge from '../components/SLABadge'

const ACTIVE_STATUSES = [1, 2, 4]

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function TicketsAtivosContent() {
  const searchParams = useSearchParams()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filterInstance, setFilterInstance] = useState(searchParams.get('instance') || '')
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '')
  const [filterSLA, setFilterSLA] = useState(searchParams.get('sla') || '')
  const [filterGroup, setFilterGroup] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error: err } = await supabase
        .from('tickets_cache')
        .select('ticket_id,title,entity,category,status_id,status_key,status_name,date_created,date_mod,due_date,is_sla_late,technician,group_name,instance')
        .in('status_id', ACTIVE_STATUSES)
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
    const interval = setInterval(load, 3 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  const filtered = tickets.filter(t => {
    if (filterInstance && (t.instance || '').toLowerCase() !== filterInstance.toLowerCase()) return false
    if (filterStatus && String(t.status_id) !== filterStatus) return false
    if (filterSLA === 'late' && !t.is_sla_late) return false
    if (filterSLA === 'ok' && t.is_sla_late) return false
    if (filterGroup && t.group_name !== filterGroup) return false
    if (search) {
      const s = search.toLowerCase()
      if (!String(t.ticket_id).includes(s) && !(t.title || '').toLowerCase().includes(s) && !(t.entity || '').toLowerCase().includes(s)) return false
    }
    return true
  })

  const groups = [...new Set(tickets.map(t => t.group_name).filter(Boolean))].sort()

  const slaLate = filtered.filter(t => t.is_sla_late).length
  const processing = filtered.filter(t => Number(t.status_id) === 2).length
  const pending = filtered.filter(t => Number(t.status_id) === 4).length

  const inputStyle = {
    padding: '7px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--background)',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>Tickets Ativos</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Novo, Em atendimento e Pendentes
          </p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {lastUpdate && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}
            </span>
          )}
          <button onClick={load} style={{ ...inputStyle, cursor: 'pointer', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 600 }}>
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary badges */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {[
          { label: 'Em atendimento', value: processing, color: 'var(--status-processing)' },
          { label: 'Pendentes', value: pending, color: 'var(--status-pending)' },
          { label: 'SLA Excedido', value: slaLate, color: 'var(--sla-late)' },
          { label: 'Total', value: filtered.length, color: 'var(--text-secondary)' },
        ].map(s => (
          <div key={s.label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            fontSize: '0.85rem',
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{s.label}:</span>
            <span style={{ fontWeight: 700, color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}>
        <input
          placeholder="Buscar ID, título ou entidade..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: '220px', flex: 1 }}
        />
        <select value={filterInstance} onChange={e => setFilterInstance(e.target.value)} style={inputStyle}>
          <option value="">Todas as instâncias</option>
          <option value="peta">Peta</option>
          <option value="gmx">GMX</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
          <option value="">Todos os status</option>
          <option value="1">Novo</option>
          <option value="2">Em atendimento</option>
          <option value="4">Pendente</option>
        </select>
        <select value={filterSLA} onChange={e => setFilterSLA(e.target.value)} style={inputStyle}>
          <option value="">Todos os SLA</option>
          <option value="late">SLA Excedido</option>
          <option value="ok">No Prazo</option>
        </select>
        <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={inputStyle}>
          <option value="">Todos os grupos</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <button onClick={() => { setSearch(''); setFilterInstance(''); setFilterStatus(''); setFilterSLA(''); setFilterGroup('') }}
          style={{ ...inputStyle, cursor: 'pointer' }}>
          Limpar
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Carregando tickets...</div>
      ) : error ? (
        <div style={{ color: 'var(--sla-late)', padding: '16px' }}>Erro: {error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>Nenhum ticket encontrado.</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                {['ID', 'Instância', 'Entidade', 'Status', 'Grupo', 'Técnico', 'Abertura', 'Últ. Atualização', 'Previsto', 'SLA'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr
                  key={t.ticket_id}
                  className={t.is_sla_late ? 'row-sla-late' : ''}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)',
                  }}
                >
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>#{t.ticket_id}</span>
                    {t.title && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>}
                  </td>
                  <td style={{ padding: '10px 14px' }}><InstanceBadge instance={t.instance} /></td>
                  <td style={{ padding: '10px 14px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.entity || '—'}</td>
                  <td style={{ padding: '10px 14px' }}><StatusBadge statusId={t.status_id} statusKey={t.status_key} statusName={t.status_name} /></td>
                  <td style={{ padding: '10px 14px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{t.group_name || '—'}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{t.technician || '—'}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_created)}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_mod)}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.due_date)}</td>
                  <td style={{ padding: '10px 14px' }}><SLABadge isLate={t.is_sla_late} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function TicketsAtivosPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Carregando...</div>}>
      <TicketsAtivosContent />
    </Suspense>
  )
}
