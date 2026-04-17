'use client'
import { useState, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { processEntity, lastGroupLabel, fmt, getStatusConfig } from '../lib/utils'
import InstanceBadge from '../components/InstanceBadge'
import StatusBadge from '../components/StatusBadge'
import SLABadge from '../components/SLABadge'

const MONTHS = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const STATUS_OPTS = [
  { v: '', l: 'Todos' },
  { v: 'new', l: 'Novo' },
  { v: 'processing', l: 'Em atendimento' },
  { v: 'pending', l: 'Pendente' },
  { v: 'solved', l: 'Solucionado' },
  { v: 'closed', l: 'Fechado' },
  { v: 'pending-approval', l: 'Aprovação' },
]

const sel = {
  padding: '7px 10px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--background)',
  color: 'var(--text-primary)', fontSize: '0.82rem',
}

export default function RelatoriosPage() {
  const now = new Date()
  const [allTickets, setAllTickets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dateType, setDateType] = useState('opening')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [fInstance, setFInstance] = useState('')
  const [fEntity, setFEntity] = useState('')
  const [fStatus, setFStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const startDate = new Date(year, month - 1, 1).toISOString()
      const endDate   = new Date(year, month, 0, 23, 59, 59).toISOString()
      const dateCol   = dateType === 'opening' ? 'date_created' : 'date_mod'
      const { data, error: err } = await getSupabaseClient()
        .from('tickets_cache')
        .select('ticket_id,title,entity,category,status_id,status_key,status_name,group_name,technician,is_sla_late,is_overdue_first,is_overdue_resolve,date_created,date_mod,instance')
        .gte(dateCol, startDate)
        .lte(dateCol, endDate)
        .order(dateCol, { ascending: false })
      if (err) throw err
      setAllTickets(data || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [dateType, year, month])

  const entities = [...new Set(allTickets.map(t => processEntity(t.entity)).filter(v => v !== '—'))].sort()

  const filtered = allTickets.filter(t => {
    if (fInstance && (t.instance || '').toUpperCase() !== fInstance.toUpperCase()) return false
    if (fEntity && processEntity(t.entity) !== fEntity) return false
    if (fStatus && t.status_key !== fStatus) return false
    return true
  })

  function exportCSV() {
    const headers = ['ID','Instância','Entidade','Categoria','Status','Grupo Responsável','Técnico','SLA Atendimento','SLA Solução','Abertura','Últ. Atualização']
    const rows = filtered.map(t => [
      t.ticket_id,
      t.instance || '',
      processEntity(t.entity),
      t.category || '',
      getStatusConfig(t.status_id, t.status_key).label,
      lastGroupLabel(t.group_name) || '—',
      t.technician || '—',
      t.is_overdue_first ? 'Fora do prazo' : 'No prazo',
      t.is_overdue_resolve ? 'Fora do prazo' : 'No prazo',
      fmt(t.date_created),
      fmt(t.date_mod),
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_${dateType}_${year}_${String(month).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const thTd = { padding: '8px 10px', fontSize: '0.8rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const thS = { ...thTd, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', background: 'var(--background)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Relatórios</h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Histórico e exportação de dados</p>
      </div>

      {/* Query filters */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {[
          { label: 'Tipo de data', el: (
            <select value={dateType} onChange={e => setDateType(e.target.value)} style={sel}>
              <option value="opening">Data de Abertura</option>
              <option value="update">Última Atualização</option>
            </select>
          )},
          { label: 'Ano', el: (
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={sel}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )},
          { label: 'Mês', el: (
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={sel}>
              {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          )},
          { label: 'Instância', el: (
            <select value={fInstance} onChange={e => setFInstance(e.target.value)} style={sel}>
              <option value="">Todas</option>
              <option value="PETA">Peta</option>
              <option value="GMX">GMX</option>
            </select>
          )},
          { label: 'Entidade', el: (
            <select value={fEntity} onChange={e => setFEntity(e.target.value)} style={{ ...sel, maxWidth: '180px' }}>
              <option value="">Todas</option>
              {entities.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          )},
          { label: 'Status', el: (
            <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={sel}>
              {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          )},
        ].map(({ label, el }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
            {el}
          </div>
        ))}
        <button onClick={load} style={{ ...sel, cursor: 'pointer', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, alignSelf: 'flex-end' }}>
          Buscar
        </button>
      </div>

      {/* Results bar */}
      {allTickets.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{filtered.length} tickets encontrados</span>
          <button onClick={exportCSV} style={{ ...sel, cursor: 'pointer', background: '#16a34a', color: '#fff', border: 'none', fontWeight: 600 }}>
            Exportar CSV
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}><div className="spinner" /></div>
      ) : error ? (
        <div style={{ color: '#dc2626', padding: '16px' }}>Erro: {error}</div>
      ) : allTickets.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Selecione os filtros e clique em <strong>Buscar</strong>.
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>Nenhum ticket corresponde aos filtros.</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                {['ID','Instância','Entidade','Categoria','Status','Grupo','Técnico','SLA Atend.','SLA Solução','Abertura','Últ. Atualização'].map(h => (
                  <th key={h} style={thS}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={`${t.ticket_id}-${t.instance}`}
                  style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                  <td style={{ ...thTd, fontWeight: 700, color: 'var(--primary)' }}>#{t.ticket_id}</td>
                  <td style={thTd}><InstanceBadge instance={t.instance} /></td>
                  <td className="col-entity" style={thTd}>{processEntity(t.entity)}</td>
                  <td className="col-entity" style={thTd}>{t.category || '—'}</td>
                  <td style={thTd}><StatusBadge statusId={t.status_id} statusKey={t.status_key} statusName={t.status_name} /></td>
                  <td className="col-group" style={{ ...thTd, color: 'var(--text-secondary)' }}>{lastGroupLabel(t.group_name)}</td>
                  <td className="col-technician" style={{ ...thTd, color: 'var(--text-secondary)' }}>{t.technician || '—'}</td>
                  <td style={thTd}><SLABadge isLate={t.is_overdue_first} /></td>
                  <td style={thTd}><SLABadge isLate={t.is_overdue_resolve} /></td>
                  <td style={{ ...thTd, color: 'var(--text-secondary)' }}>{fmt(t.date_created)}</td>
                  <td style={{ ...thTd, color: 'var(--text-secondary)' }}>{fmt(t.date_mod)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
