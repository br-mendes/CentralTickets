'use client'
import { useState, useCallback, useEffect } from 'react'
import { fetchAllTickets } from '../lib/tickets-api'
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
  { v: 'closed+solved', l: 'Fechado + Solucionado' },
  { v: 'notsolved', l: 'Não solucionado' },
]

const sel = {
  padding: '7px 10px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--background)',
  color: 'var(--text-primary)', fontSize: '0.82rem',
}

export default function RelCofenPage() {
  const now = new Date()
  const [allTickets, setAllTickets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [missingColumns, setMissingColumns] = useState(false)
  const [dateType, setDateType] = useState('opening')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [fInstance, setFInstance] = useState('')
  const [fEntity, setFEntity] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fTech, setFTech] = useState('')
  const [fGroup, setFGroup] = useState('')
  const [fPriority, setFPriority] = useState('')

  // Sophos state
  const [sophosLoading, setSophosLoading] = useState(false)
  const [sophosData, setSophosData] = useState(null)
  const [sophosError, setSophosError] = useState(null)
  const [sophosRegion] = useState('br01')

  const loadSophosData = useCallback(async () => {
    setSophosLoading(true)
    setSophosError(null)
    try {
      const endpoints = ['whoami', 'tenants', 'endpoints', 'alerts', 'users']
      const results = {}

      for (const ep of endpoints) {
        try {
          const res = await fetch(`/api/sophos?endpoint=${ep}`)
          const data = await res.json()
          results[ep] = data
        } catch (e) {
          results[ep] = { error: e.message }
        }
      }

      setSophosData({
        whoami: results.whoami,
        tenants: results.tenants?.items || results.tenants || [],
        endpoints: results.endpoints?.items || results.endpoints || [],
        alerts: results.alerts?.items || results.alerts || [],
        users: results.users?.items || results.users || [],
        lastSync: new Date().toISOString()
      })
    } catch (e) {
      setSophosError(e.message)
    } finally {
      setSophosLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null); setMissingColumns(false)
    try {
      const startDate = new Date(year, month - 1, 1).toISOString()
      const endDate   = new Date(year, month, 0, 23, 59, 59).toISOString()
      const dateCol   = dateType === 'opening' ? 'date_created' : 'date_mod'
      const result = await fetchAllTickets({
        instance: 'PETA,GMX',
        dateField: dateCol,
        fromDate: startDate,
        toDate: endDate,
      })
      const data = result?.data || []
      setMissingColumns(data.length > 0 && !('date_solved' in data[0] && 'solution' in data[0]))
      setAllTickets(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [dateType, year, month])

  const entities    = [...new Set(allTickets.map(t => processEntity(t.entity)).filter(v => v !== '—'))].sort()
  const technicians = [...new Set(allTickets.map(t => t.technician).filter(Boolean))].sort()
  const groups      = [...new Set(allTickets.map(t => lastGroupLabel(t.group_name)).filter(v => v !== '—'))].sort()

  const filtered = allTickets.filter(t => {
    if (fInstance && (t.instance || '').toUpperCase() !== fInstance.toUpperCase()) return false
    if (fEntity  && processEntity(t.entity) !== fEntity) return false
    if (fStatus) {
      if (fStatus === 'closed+solved') {
        if (t.status_key !== 'solved' && t.status_key !== 'closed') return false
      } else if (fStatus === 'notsolved') {
        if (t.status_key === 'solved' || t.status_key === 'closed') return false
      } else {
        if (t.status_key !== fStatus) return false
      }
    }
    if (fTech     && (t.technician || '') !== fTech) return false
    if (fGroup    && lastGroupLabel(t.group_name) !== fGroup) return false
    if (fPriority && String(t.priority_id || '') !== fPriority) return false
    return true
  })

  useEffect(() => {
    loadSophosData()
  }, [loadSophosData])

  const hasSolution = allTickets.some(t => 'date_solved' in t || 'solution' in t)

  const PRIORITY_LABELS = { 1: 'Muito Baixa', 2: 'Baixa', 3: 'Média', 4: 'Alta', 5: 'Urgente', 6: 'Crítica' }
  const PRIORITY_COLORS = ['#64748b', '#3b82f6', '#d97706', '#ea580c', '#dc2626', '#7f1d1d']

  function exportCSV() {
    const baseH = ['ID','Instância','Entidade','Categoria','Status','Prioridade','Canal','Grupo Responsável','Técnico','SLA Atendimento','SLA Solução','Abertura','Últ. Atualização']
    const headers = hasSolution ? [...baseH, 'Data Solução', 'Solução'] : baseH
    const rows = filtered.map(t => {
      const base = [
        t.ticket_id,
        t.instance || '',
        processEntity(t.entity),
        t.category || '',
        getStatusConfig(t.status_id, t.status_key).label,
        PRIORITY_LABELS[t.priority_id] || '—',
        t.requester || '—',
        t.request_type || '—',
        lastGroupLabel(t.group_name) || '—',
        t.technician || '—',
        t.is_overdue_first ? 'Fora do prazo' : 'No prazo',
        t.is_overdue_resolve ? 'Fora do prazo' : 'No prazo',
        fmt(t.date_created),
        fmt(t.date_mod),
      ]
      if (hasSolution) base.push(fmt(t.date_solved), t.solution || '—')
      return base
    })
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relcofen_${dateType}_${year}_${String(month).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const thTd = { padding: '8px 10px', fontSize: '0.8rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const thS  = { ...thTd, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', background: 'var(--background)' }

  const filterDefs = [
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
    { label: 'Status', el: (
      <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={sel}>
        {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    )},
    { label: 'Entidade', el: (
      <select value={fEntity} onChange={e => setFEntity(e.target.value)} style={{ ...sel, maxWidth: '180px' }}>
        <option value="">Todas</option>
        {entities.map(e => <option key={e} value={e}>{e}</option>)}
      </select>
    )},
    { label: 'Técnico', el: (
      <select value={fTech} onChange={e => setFTech(e.target.value)} style={{ ...sel, maxWidth: '180px' }}>
        <option value="">Todos</option>
        {technicians.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    )},
    { label: 'Grupo', el: (
      <select value={fGroup} onChange={e => setFGroup(e.target.value)} style={{ ...sel, maxWidth: '180px' }}>
        <option value="">Todos</option>
        {groups.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
    )},
    { label: 'Prioridade', el: (
      <select value={fPriority} onChange={e => setFPriority(e.target.value)} style={sel}>
        <option value="">Todas</option>
        <option value="6">Crítica</option>
        <option value="5">Urgente</option>
        <option value="4">Alta</option>
        <option value="3">Média</option>
        <option value="2">Baixa</option>
        <option value="1">Muito Baixa</option>
      </select>
    )},
  ]

  const baseHeaders = ['ID','Instância','Entidade','Categoria','Status','Prioridade','Grupo','Técnico','SLA Atend.','SLA Solução','Abertura','Últ. Atualização']
  const tableHeaders = hasSolution ? [...baseHeaders, 'Data Solução', 'Solução'] : baseHeaders

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Relatório Cofen</h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Relatórios mensais com integração Sophos Central APIs
        </p>
      </div>

      {/* Migration notice */}
      {missingColumns && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 'var(--radius-lg)', padding: '12px 16px' }}>
          <div style={{ fontWeight: 600, color: '#ea580c', marginBottom: '4px', fontSize: '0.85rem' }}>Colunas de solução não encontradas</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '8px' }}>
            As colunas <code>date_solved</code> e <code>solution</code> ainda não existem. Execute a migration abaixo no painel Supabase para habilitá-las.
          </p>
          <pre style={{ padding: '10px', background: 'var(--background)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', overflowX: 'auto' }}>
{`-- migration-v4.sql
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS date_solved TIMESTAMPTZ;
ALTER TABLE tickets_cache ADD COLUMN IF NOT EXISTS solution TEXT;
CREATE INDEX IF NOT EXISTS idx_tickets_cache_date_solved ON tickets_cache(date_solved);`}
          </pre>
        </div>
      )}

      {/* Sophos Central APIs Integration */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Sophos Central APIs</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Data Region: {sophosRegion} | Autenticação: OAuth2 (Service Principal)
            </p>
          </div>
          <button onClick={loadSophosData} className="btn-primary" disabled={sophosLoading}>
            {sophosLoading ? 'Carregando...' : 'Sincronizar'}
          </button>
        </div>

        {sophosError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', padding: '8px 12px', color: '#dc2626', fontSize: '0.82rem' }}>
            Erro: {sophosError}
          </div>
        )}

        {sophosData && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            <div className="stat-card">
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>API Status</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>OK</div>
            </div>
            <div className="stat-card">
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Tenants</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{sophosData.tenants?.length || 0}</div>
            </div>
            <div className="stat-card">
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Endpoints</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{sophosData.endpoints?.length || 0}</div>
            </div>
            <div className="stat-card">
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Alertas</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{sophosData.alerts?.length || 0}</div>
            </div>
            <div className="stat-card">
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Usuários</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{sophosData.users?.length || 0}</div>
            </div>
            <div className="stat-card">
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Região</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{sophosRegion}</div>
            </div>
          </div>
        )}

        <div style={{ marginTop: '16px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <strong>APIs Integradas:</strong> Partner API, Common API, Endpoint API, SIEM Integration API
          <br />
          <strong>Base URLs:</strong> Global: api.central.sophos.com | Regional: api-br01.central.sophos.com
          <br />
          <strong>Autenticação:</strong> OAuth2 client_credentials → Bearer Token
          <br />
          <strong>Rate Limit:</strong> 10/s, 100/min, 200.000/dia
        </div>
      </div>

      {/* Query filters */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {filterDefs.map(({ label, el }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
            {el}
          </div>
        ))}
        <button onClick={load} className="btn-primary" style={{ alignSelf: 'flex-end' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Buscar
        </button>
        {allTickets.length > 0 && (
          <button onClick={() => { setFInstance(''); setFEntity(''); setFStatus(''); setFTech(''); setFGroup(''); setFPriority('') }}
            style={{ ...sel, cursor: 'pointer', alignSelf: 'flex-end' }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Results bar */}
      {allTickets.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{filtered.length} de {allTickets.length} tickets</span>
          <button onClick={exportCSV} className="btn-export">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
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
                {tableHeaders.map(h => <th key={h} style={thS}>{h}</th>)}
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
                  <td style={thTd}>
                    {t.priority_id ? <span style={{ fontWeight: 600, fontSize: '0.75rem', color: PRIORITY_COLORS[Number(t.priority_id) - 1] }}>{PRIORITY_LABELS[t.priority_id]}</span> : '—'}
                  </td>
                  <td className="col-group" style={{ ...thTd, color: 'var(--text-secondary)' }}>{lastGroupLabel(t.group_name)}</td>
                  <td className="col-technician" style={{ ...thTd, color: 'var(--text-secondary)' }}>{t.technician || '—'}</td>
                  <td style={thTd}><SLABadge isLate={t.is_overdue_first} /></td>
                  <td style={thTd}><SLABadge isLate={t.is_overdue_resolve} /></td>
                  <td style={{ ...thTd, color: 'var(--text-secondary)' }}>{fmt(t.date_created)}</td>
                  <td style={{ ...thTd, color: 'var(--text-secondary)' }}>{fmt(t.date_mod)}</td>
                  {hasSolution && <>
                    <td style={{ ...thTd, color: 'var(--text-secondary)' }}>{fmt(t.date_solved)}</td>
                    <td style={{ ...thTd, maxWidth: '300px', whiteSpace: 'normal', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{t.solution || '—'}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '32px' }}>
        <a href="/relatorios" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
          ← Voltar para Relatórios
        </a>
      </div>
    </div>
  )
}