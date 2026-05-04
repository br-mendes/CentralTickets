'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { DoughnutChart, LineChart, BarChart } from './components/Charts'
import { fmt, fmtDate, formatWaitTime } from './lib/utils'

// ── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#f97316', '#dc2626', '#7f1d1d']
const PRIORITY_LABELS = { 1: 'Muito Baixa', 2: 'Baixa', 3: 'Média', 4: 'Alta', 5: 'Urgente', 6: 'Crítica' }

const STATUS_LABEL_KEY = {
  'Novo': 'new', 'Em Atendimento': 'processing', 'Pendente': 'pending',
  'Aprovação': 'approval', 'Solucionado': 'solved', 'Fechado': 'closed',
}

const INSTANCE_OPTIONS = [
  { value: 'PETA,GMX', label: 'PETA + GMX' },
  { value: 'PETA',     label: 'PETA' },
  { value: 'GMX',      label: 'GMX' },
]

const DAYS_OPTIONS = [
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 180, label: '180 dias' },
  { value: 365, label: '1 ano' },
]

const TABS = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'technicians', label: 'Técnicos' },
  { id: 'categories', label: 'Categorias' },
  { id: 'sla', label: 'SLA' },
  { id: 'reports', label: 'Relatórios' },
]

const REFRESH_INTERVAL = 10 * 60 * 1000

// ── Styles ───────────────────────────────────────────────────────────────────

const thTd = { padding: '8px 12px', fontSize: '0.82rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const thStyle = { ...thTd, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', background: 'var(--background)' }
const selStyle = { padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer' }

// ── Small components ─────────────────────────────────────────────────────────

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

function StatCard({ label, value, color, href, sub, highlight }) {
  const inner = (
    <div className="stat-card" style={highlight ? { borderLeft: `3px solid ${color}` } : {}}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '1.9rem', fontWeight: 700, color, lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
  if (href) return <Link href={href} className="btn-link" style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>
  return inner
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
      <h2 className="section-title" style={{ marginBottom: 0 }}>{children}</h2>
      {action}
    </div>
  )
}

function Card({ children, style }) {
  return <div className="card" style={style}>{children}</div>
}

function ProgressBar({ value, max, color = 'var(--primary)' }) {
  return (
    <div style={{ flex: 1, height: '8px', background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
      <div style={{ height: '100%', borderRadius: '9999px', width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color }} />
    </div>
  )
}

function RefreshCountdown({ nextAt }) {
  const [secsLeft, setSecsLeft] = useState(null)
  useEffect(() => {
    const tick = () => setSecsLeft(Math.max(0, Math.round((nextAt - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 10000)
    return () => clearInterval(t)
  }, [nextAt])
  if (secsLeft === null) return null
  const mins = Math.ceil(secsLeft / 60)
  return <span className="text-muted-sm">Atualiza em {mins}min</span>
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '2px', borderBottom: '2px solid var(--border)', marginBottom: '20px', overflowX: 'auto' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            padding: '9px 18px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            background: 'transparent', whiteSpace: 'nowrap',
            borderBottom: active === t.id ? '2px solid var(--primary)' : '2px solid transparent',
            color: active === t.id ? 'var(--primary)' : 'var(--text-secondary)',
            marginBottom: '-2px', transition: 'all 0.15s',
          }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function Spinner({ height = 200 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
      <div className="spinner" />
    </div>
  )
}

// ── Técnicos Tab ──────────────────────────────────────────────────────────────

function TechniciansTab({ analytics }) {
  const techRows = (analytics?.by_technician ?? []).map(r => [r.name, r.count])
  const max = techRows[0]?.[1] || 1

  if (!techRows.length) return <p style={{ color: 'var(--text-muted)' }}>Sem dados.</p>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      <Card>
        <SectionTitle>Top 10 Técnicos</SectionTitle>
        <BarChart
          labels={techRows.map(([n]) => n === '—' ? 'Sem técnico' : n)}
          data={techRows.map(([, c]) => c)}
          colors={techRows.map(() => '#2563eb')}
          height={320}
          horizontal
        />
      </Card>
      <Card>
        <SectionTitle>Ranking</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {techRows.map(([name, count], i) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '20px', textAlign: 'center', fontWeight: 700 }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name === '—' ? <em style={{ color: 'var(--text-muted)' }}>Sem técnico</em> : name}
              </span>
              <ProgressBar value={count} max={max} />
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', width: '40px', textAlign: 'right' }}>{count}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Categorias Tab ────────────────────────────────────────────────────────────

function CategoriesTab({ analytics }) {
  const catRows = (analytics?.by_category ?? []).map(r => [r.name, r.count])
  const groupRows = (analytics?.by_group ?? []).map(r => [r.name, r.count])
  const reqTypeRows = (analytics?.by_request_type ?? []).map(r => [r.name, r.count])
  const maxCat = catRows[0]?.[1] || 1
  const maxGroup = groupRows[0]?.[1] || 1
  const maxReq = reqTypeRows[0]?.[1] || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {catRows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Card>
            <SectionTitle>Top 10 Categorias</SectionTitle>
            <BarChart labels={catRows.map(([n]) => n)} data={catRows.map(([, c]) => c)} colors={catRows.map(() => '#7c3aed')} height={320} horizontal />
          </Card>
          <Card>
            <SectionTitle>Ranking por Categoria</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {catRows.map(([name, count], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '20px', textAlign: 'center', fontWeight: 700 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <ProgressBar value={count} max={maxCat} color="#7c3aed" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#7c3aed', width: '40px', textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: groupRows.length > 0 ? '1fr 1fr' : '1fr', gap: '16px' }}>
        {groupRows.length > 0 && (
          <Card>
            <SectionTitle>Por Grupo</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {groupRows.map(([name, count]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  <span style={{ flex: 1, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                    {name === '—' ? <em>Sem grupo</em> : name}
                  </span>
                  <ProgressBar value={count} max={maxGroup} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, width: '36px', textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
        {reqTypeRows.length > 1 && (
          <Card>
            <SectionTitle>Canal de Requisição</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {reqTypeRows.map(([name, count]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  <span style={{ flex: 1, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{name}</span>
                  <ProgressBar value={count} max={maxReq} color="#0ea5e9" />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, width: '36px', textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── SLA Tab ───────────────────────────────────────────────────────────────────

function SlaTab({ analytics, instance, days }) {
  const [slaData, setSlaData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/py/tickets?instance=${instance}&days=${days}&sla_late=true&status=new,processing,pending,approval&page_size=500`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setSlaData(d) })
      .catch(() => { if (!cancelled) setSlaData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [instance, days])

  const kpis = analytics?.kpis ?? {}
  const total = kpis.total ?? 0
  const slaLate = kpis.sla_late ?? 0
  const slaActive = kpis.sla_late_active ?? 0
  const compliance = total > 0 ? (((total - slaLate) / total) * 100).toFixed(1) : null
  const tickets = slaData?.tickets ?? []

  const byEntity = {}
  for (const t of tickets) {
    const e = t.entity_clean || '—'
    byEntity[e] = (byEntity[e] || 0) + 1
  }
  const entityEntries = Object.entries(byEntity).sort(([, a], [, b]) => b - a).slice(0, 10)
  const maxEnt = entityEntries[0]?.[1] || 1

  const compColor = compliance === null ? '#94a3b8' : Number(compliance) >= 90 ? '#16a34a' : Number(compliance) >= 75 ? '#ea580c' : '#dc2626'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: '12px' }}>
        <StatCard label="SLA Excedido Total" value={slaLate} color="#dc2626" highlight />
        <StatCard label="Em Aberto" value={slaActive} color="#dc2626" highlight />
        <StatCard label="Conformidade" value={compliance !== null ? `${compliance}%` : '—'} color={compColor} highlight />
      </div>

      {loading ? <Spinner /> : (
        <>
          {tickets.length > 0 && (
            <Card>
              <SectionTitle>Críticos não resolvidos — {slaData?.total ?? tickets.length}</SectionTitle>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      {['ID', 'Instância', 'Título', 'Status', 'Prioridade', 'Entidade', 'Técnico', 'Vencimento', 'Atraso (d)'].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t, i) => {
                      const daysOverdue = t.due_date ? Math.max(0, Math.floor((Date.now() - new Date(t.due_date)) / 86400000)) : 0
                      return (
                        <tr key={`${t.ticket_id}-${t.instance}`} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                          <td style={{ ...thTd, fontWeight: 700, color: 'var(--primary)' }}>
                            <Link href={`/tickets?search=${t.ticket_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>#{t.ticket_id}</Link>
                          </td>
                          <td style={thTd}><span className={`instance-badge ${(t.instance || '').toLowerCase()}`}>{t.instance}</span></td>
                          <td style={{ ...thTd, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.title}>{t.title || '—'}</td>
                          <td style={thTd}><span className={`status-badge ${t.status_key ?? 'unknown'}`}>{t.status_label || '—'}</span></td>
                          <td style={thTd}>{t.priority_label || '—'}</td>
                          <td style={{ ...thTd, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.entity_clean || '—'}</td>
                          <td style={{ ...thTd, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.technician || '—'}</td>
                          <td style={thTd}>{fmtDate(t.due_date)}</td>
                          <td style={{ ...thTd, color: '#dc2626', fontWeight: 700 }}>{daysOverdue > 0 ? `${daysOverdue}d` : '< 1d'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {entityEntries.length > 0 && (
            <Card>
              <SectionTitle>SLA Excedido por Entidade</SectionTitle>
              <BarChart labels={entityEntries.map(([n]) => n)} data={entityEntries.map(([, c]) => c)} colors={entityEntries.map(() => '#dc2626')} height={280} horizontal />
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ── Relatórios Tab ────────────────────────────────────────────────────────────

function ReportsTab({ instance, days, analyticsData }) {
  const [filters, setFilters] = useState({ status: '', typeId: '', priorityId: '', slaLate: false, entity: '', technician: '', category: '', search: '' })
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const entityOptions = (analyticsData?.by_entity ?? []).map(r => r.name)
  const techOptions = (analyticsData?.by_technician ?? []).map(r => r.name)
  const catOptions = (analyticsData?.by_category ?? []).map(r => r.name)

  const fetchTickets = useCallback(async (inst, d, f, p) => {
    const id = ++seq.current
    setLoading(true)
    const params = new URLSearchParams({ instance: inst, days: d, page: p, page_size: 100 })
    if (f.status) params.set('status', f.status)
    if (f.typeId) params.set('type_id', f.typeId)
    if (f.priorityId) params.set('priority_id', f.priorityId)
    if (f.slaLate) params.set('sla_late', 'true')
    if (f.entity) params.set('entity', f.entity)
    if (f.technician) params.set('technician', f.technician)
    if (f.category) params.set('category', f.category)
    if (f.search) params.set('search', f.search)
    try {
      const res = await fetch(`/api/py/tickets?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (id === seq.current) setResult(data)
    } catch { if (id === seq.current) setResult(null) }
    finally { if (id === seq.current) setLoading(false) }
  }, [])

  useEffect(() => { fetchTickets(instance, days, filters, page) }, [fetchTickets, instance, days, filters, page])

  const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }
  const clearFilters = () => { setFilters({ status: '', typeId: '', priorityId: '', slaLate: false, entity: '', technician: '', category: '', search: '' }); setPage(1) }

  const exportCsv = () => {
    if (!result?.tickets?.length) return
    const cols = ['ticket_id', 'instance', 'title', 'status_label', 'priority_label', 'entity_clean', 'technician', 'date_created', 'date_solved', 'resolution_fmt']
    const hdrs = ['ID', 'Instância', 'Título', 'Status', 'Prioridade', 'Entidade', 'Técnico', 'Criado em', 'Resolvido em', 'Duração']
    const lines = result.tickets.map(t => cols.map(c => `"${String(t[c] ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = [hdrs.join(','), ...lines].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `tickets-p${page}.csv`
    a.click()
  }

  const lbl = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={lbl}>Status
            <select style={selStyle} value={filters.status} onChange={e => setFilter('status', e.target.value)}>
              <option value="">Todos</option>
              <option value="new">Novo</option>
              <option value="processing">Em Atendimento</option>
              <option value="pending">Pendente</option>
              <option value="approval">Aprovação</option>
              <option value="solved">Solucionado</option>
              <option value="closed">Fechado</option>
            </select>
          </label>
          <label style={lbl}>Tipo
            <select style={selStyle} value={filters.typeId} onChange={e => setFilter('typeId', e.target.value)}>
              <option value="">Todos</option>
              <option value="1">Incidente</option>
              <option value="2">Requisição</option>
            </select>
          </label>
          <label style={lbl}>Prioridade
            <select style={selStyle} value={filters.priorityId} onChange={e => setFilter('priorityId', e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label style={lbl}>Entidade
            <select style={{ ...selStyle, minWidth: '140px' }} value={filters.entity} onChange={e => setFilter('entity', e.target.value)}>
              <option value="">Todas</option>
              {entityOptions.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <label style={lbl}>Técnico
            <select style={{ ...selStyle, minWidth: '140px' }} value={filters.technician} onChange={e => setFilter('technician', e.target.value)}>
              <option value="">Todos</option>
              {techOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label style={lbl}>Categoria
            <select style={{ ...selStyle, minWidth: '140px' }} value={filters.category} onChange={e => setFilter('category', e.target.value)}>
              <option value="">Todas</option>
              {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ ...lbl, flex: 1, minWidth: '160px' }}>Buscar
            <input style={{ ...selStyle, width: '100%' }} placeholder="ID ou título..." value={filters.search} onChange={e => setFilter('search', e.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', paddingBottom: '2px' }}>
            <input type="checkbox" checked={filters.slaLate} onChange={e => setFilter('slaLate', e.target.checked)} />
            SLA excedido
          </label>
          <button className="btn-secondary" onClick={clearFilters}>Limpar</button>
        </div>
      </Card>

      {loading ? <Spinner /> : result && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {(result.total ?? 0).toLocaleString()} tickets — página {result.page} de {result.pages}
              {result.data_truncated && <span style={{ color: '#ea580c', marginLeft: '8px' }}>⚠️ dados truncados</span>}
            </span>
            <button className="btn-export" onClick={exportCsv}>⬇️ Exportar página CSV</button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  {['ID', 'Inst.', 'Título', 'Status', 'Tipo', 'Prior.', 'Entidade', 'Técnico', 'Criado em', 'Resolvido', 'Duração'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.tickets.map((t, i) => (
                  <tr key={`${t.ticket_id}-${t.instance}`} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                    <td style={{ ...thTd, fontWeight: 700, color: 'var(--primary)' }}>
                      <Link href={`/tickets?search=${t.ticket_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>#{t.ticket_id}</Link>
                    </td>
                    <td style={thTd}><span className={`instance-badge ${(t.instance || '').toLowerCase()}`}>{t.instance}</span></td>
                    <td style={{ ...thTd, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.title}>{t.title || '—'}</td>
                    <td style={thTd}><span className={`status-badge ${t.status_key ?? 'unknown'}`}>{t.status_label || '—'}</span></td>
                    <td style={thTd}>{t.type_id === 1 ? 'Inc.' : t.type_id === 2 ? 'Req.' : '—'}</td>
                    <td style={thTd}>{t.priority_label || '—'}</td>
                    <td style={{ ...thTd, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.entity_clean || '—'}</td>
                    <td style={{ ...thTd, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.technician || '—'}</td>
                    <td style={thTd}>{fmtDate(t.date_created)}</td>
                    <td style={thTd}>{fmtDate(t.date_solved)}</td>
                    <td style={thTd}>{t.resolution_fmt || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.pages > 1 && (
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className="btn-secondary" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
              {Array.from({ length: Math.min(7, result.pages) }, (_, i) => {
                let p = result.pages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= result.pages - 3 ? result.pages - 6 + i : page - 3 + i
                if (p < 1 || p > result.pages) return null
                return <button key={p} className={p === page ? 'btn-primary' : 'btn-secondary'} onClick={() => setPage(p)} style={{ minWidth: '34px' }}>{p}</button>
              })}
              <button className="btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page === result.pages}>›</button>
              <button className="btn-secondary" onClick={() => setPage(result.pages)} disabled={page === result.pages}>»</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [analytics, setAnalytics]   = useState(null)
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [instance, setInstance]     = useState('PETA,GMX')
  const [days, setDays]             = useState(365)
  const [activeTab, setActiveTab]   = useState('overview')
  const [nextRefresh, setNextRefresh] = useState(Date.now() + REFRESH_INTERVAL)
  const loadSeq = useRef(0)

  const load = useCallback(async (inst, d) => {
    const seq = ++loadSeq.current
    setFetchError(null)
    try {
      const res = await fetch(`/api/py/analytics?instance=${inst}&days=${d}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (seq === loadSeq.current) {
        setAnalytics(data)
        setNextRefresh(Date.now() + REFRESH_INTERVAL)
      }
    } catch (e) {
      if (seq === loadSeq.current) setFetchError(e.message)
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    load(instance, days)
    const iv = setInterval(() => load(instance, days), REFRESH_INTERVAL)
    return () => clearInterval(iv)
  }, [load, instance, days])

  const a            = analytics
  const dataTruncated = a?.data_truncated ?? false
  const kpis         = a?.kpis       ?? {}
  const byStatusKey  = Object.fromEntries((a?.by_status ?? []).map(s => [s.key, s.count]))
  const slaCritico   = a?.sla_critical ?? []
  const rate7        = a?.resolution_rate_7d  ?? { rate: 0, resolved: 0, total: 0 }
  const rate30       = a?.resolution_rate_30d ?? { rate: 0, resolved: 0, total: 0 }
  const trend        = a?.trend_30d  ?? { labels: [], opened: [], closed: [] }

  const catRows      = (a?.by_category    ?? []).slice(0, 8).map(r => [r.name, r.count])
  const techRows     = (a?.by_technician  ?? []).slice(0, 8).map(r => [r.name, r.count])
  const entityRows   = (a?.by_entity      ?? []).map(r => [r.name, { total: r.count }])
  const groupRows    = (a?.by_group       ?? []).slice(0, 8).map(r => [r.name, r.count])
  const reqTypeRows  = (a?.by_request_type ?? []).map(r => [r.name, r.count])

  const maxCat     = catRows[0]?.[1]     || 1
  const maxTech    = techRows[0]?.[1]    || 1
  const maxGroup   = groupRows[0]?.[1]   || 1
  const maxReqType = reqTypeRows[0]?.[1] || 1

  const prioLabels = (a?.by_priority ?? []).map(r => r.label)
  const prioData   = (a?.by_priority ?? []).map(r => r.count)
  const prioColors = (a?.by_priority ?? []).map(r => PRIORITY_COLORS[(r.priority_id ?? 3) - 1] || '#94a3b8')

  const slaCompliance = kpis.total > 0
    ? (((kpis.total - (kpis.sla_late ?? 0)) / kpis.total) * 100).toFixed(1)
    : null

  const lineDatasets = [
    { label: 'Abertos',  data: trend.opened, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.3, pointRadius: 2 },
    { label: 'Fechados', data: trend.closed, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)',  fill: true, tension: 0.3, pointRadius: 2 },
  ]
  const chartStatusLabels = ['Novo', 'Em atendimento', 'Pendente', 'Aprovação', 'Solucionado', 'Fechado']
  const chartStatusData   = [
    byStatusKey.new || 0,
    byStatusKey.processing || 0,
    byStatusKey.pending || 0,
    (byStatusKey.approval || 0) + (byStatusKey['pending-approval'] || 0),
    byStatusKey.solved || 0,
    byStatusKey.closed || 0,
  ]
  const chartStatusColors = ['#3b82f6', '#22c55e', '#f97316', '#7c3aed', '#6b7280', '#1f2937']

  if (loading) return <Spinner height={300} />

  if (fetchError && !analytics) return (
    <div style={{ padding: '24px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      <span><strong>Erro ao carregar:</strong> {fetchError}</span>
      <button onClick={() => load(instance, days)} style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Tentar novamente</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {fetchError && analytics && (
        <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '0.85rem' }}>
          <strong>Erro ao atualizar:</strong> {fetchError}
          <button onClick={() => load(instance, days)} style={{ marginLeft: '12px', padding: '3px 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '0.8rem' }}>Tentar</button>
        </div>
      )}

      {dataTruncated && (
        <div style={{ padding: '10px 16px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, color: '#c2410c', fontSize: '0.82rem' }}>
          ⚠️ Dados truncados no servidor — totais podem estar subestimados.
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Central de Tickets</h1>
          <div style={{ display: 'flex', gap: '16px', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            {a?.generated_at && <span className="text-muted-sm">Gerado às {new Date(a.generated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
            {a?.last_sync && <span className="text-muted-sm">Sync: {fmt(a.last_sync)}</span>}
            <RefreshCountdown nextAt={nextRefresh} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--border)', borderRadius: '8px', padding: '2px', gap: '2px' }}>
            {INSTANCE_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setInstance(opt.value)}
                style={{
                  padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s',
                  background: instance === opt.value ? 'var(--surface)' : 'transparent',
                  color: instance === opt.value ? 'var(--primary)' : 'var(--text-secondary)',
                  boxShadow: instance === opt.value ? 'var(--shadow-sm)' : 'none',
                }}>
                {opt.label}
              </button>
            ))}
          </div>
          <select style={selStyle} value={days} onChange={e => setDays(Number(e.target.value))}>
            {DAYS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={() => load(instance, days)} className="btn-primary">
            <RefreshIcon /> Atualizar
          </button>
        </div>
      </div>

      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: '12px' }}>
            <StatCard label="Total" value={kpis.total} color="var(--text-primary)" />
            <StatCard label="Incidentes" value={kpis.incidents} color="#dc2626" href="/incidentes" highlight />
            <StatCard label="Requisições" value={kpis.requests} color="#3b82f6" href="/tickets" highlight />
            <StatCard label="Em Atendimento" value={kpis.processing} color="#16a34a" href="/tickets?status=processing" highlight />
            <StatCard label="Pendentes" value={kpis.pending} color="#ea580c" href="/tickets?status=pending" highlight />
            <StatCard label="Aprovação" value={kpis.approval} color="#7c3aed" href="/tickets?status=approval,pending-approval" highlight />
            <StatCard label="SLA Excedido" value={kpis.sla_late} color="#dc2626" href="/tickets?sla=late" sub={`${kpis.sla_late_active ?? 0} não resolvidos`} highlight />
            {slaCompliance !== null && <StatCard label="Conformidade SLA" value={`${slaCompliance}%`} color={Number(slaCompliance) >= 90 ? '#16a34a' : Number(slaCompliance) >= 75 ? '#ea580c' : '#dc2626'} highlight />}
            {kpis.avg_resolution && kpis.avg_resolution !== '—' && <StatCard label="TMR" value={kpis.avg_resolution} color="#6b7280" sub="Tempo médio resolução" />}
          </div>

          {instance === 'PETA,GMX' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              {[{ key: 'PETA', color: '#2563eb' }, { key: 'GMX', color: '#ea580c' }].map(({ key, color }) => {
                const inst = a?.instance_breakdown?.[key] ?? {}
                return (
                  <Card key={key} style={{ borderLeft: `3px solid ${color}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px' }}>
                      <span style={{ fontWeight: 700, fontSize: '1rem', color }}>{key}</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{inst.total ?? 0} tickets</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {[
                        { k: 'new', l: 'Novos', c: '#3b82f6' },
                        { k: 'processing', l: 'Atendimento', c: '#22c55e' },
                        { k: 'pending', l: 'Pendentes', c: '#f97316' },
                        { k: 'approval', l: 'Aprovação', c: '#7c3aed' },
                        { k: 'solved', l: 'Solucionados', c: '#6b7280' },
                        { k: 'closed', l: 'Fechados', c: '#374151' },
                      ].map(({ k, l, c }) => (
                        <div key={k} style={{ textAlign: 'center', minWidth: '64px' }}>
                          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: c }}>{inst[k] ?? 0}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '1px' }}>{l}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px' }}>
            <Card>
              <SectionTitle>Por Status</SectionTitle>
              <DoughnutChart labels={chartStatusLabels} data={chartStatusData} colors={chartStatusColors} height={200} />
            </Card>
            <Card>
              <SectionTitle>Últimos 30 Dias</SectionTitle>
              <LineChart labels={trend.labels} datasets={lineDatasets} height={200} />
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <StatCard label="Resolução (7d)" value={`${rate7.rate}%`} color="#16a34a" sub={`${rate7.resolved}/${rate7.total}`} />
            <StatCard label="Resolução (30d)" value={`${rate30.rate}%`} color="#16a34a" sub={`${rate30.resolved}/${rate30.total}`} />
            <StatCard label="Tempo em Pendência" value={formatWaitTime(kpis.avg_pending_hours ?? 0)} color="#ea580c" sub={`${kpis.pending ?? 0} tickets`} />
          </div>

          {prioData.length > 0 && (
            <Card>
              <SectionTitle>Por Prioridade</SectionTitle>
              <BarChart labels={prioLabels} data={prioData} colors={prioColors} height={200} />
            </Card>
          )}

          {slaCritico.length > 0 && (
            <Card>
              <SectionTitle action={<button className="btn-link" onClick={() => setActiveTab('sla')} style={{ fontSize: '0.78rem' }}>Ver aba SLA →</button>}>
                SLA Crítico — {kpis.sla_late_active ?? slaCritico.length} não resolvidos
              </SectionTitle>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead><tr>{['ID', 'Instância', 'Título', 'Entidade', 'Status', 'Prioridade', 'Atraso'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>{slaCritico.map((t, i) => (<tr key={`${t.ticket_id}-${t.instance}`} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}><td style={{ ...thTd, fontWeight: 700, color: 'var(--primary)' }}><Link href={`/tickets?search=${t.ticket_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>#{t.ticket_id}</Link></td><td style={thTd}><span className={`instance-badge ${(t.instance || '').toLowerCase()}`}>{t.instance}</span></td><td style={{ ...thTd, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.title}>{t.title || '—'}</td><td style={{ ...thTd, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.entity_clean || '—'}</td><td style={thTd}><span className={`status-badge ${STATUS_LABEL_KEY[t.status_label] ?? 'unknown'}`}>{t.status_label || '—'}</span></td><td style={thTd}>{t.priority_label || '—'}</td><td style={{ ...thTd, color: '#dc2626', fontWeight: 700 }}>{(t.days_overdue ?? 0) > 0 ? `${t.days_overdue}d` : '< 1d'}</td></tr>))}</tbody>
                </table>
              </div>
            </Card>
          )}

          {(kpis.approval ?? 0) > 0 && (
            <Card>
              <SectionTitle action={kpis.approval > 5 ? <Link href="/tickets?status=approval,pending-approval" style={{ fontSize: '0.78rem', color: 'var(--primary)' }}>Ver todos {kpis.approval} →</Link> : null}>
                Tickets em Aprovação — {kpis.approval}
              </SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(a?.approval_tickets ?? []).map(t => (
                  <div key={`${t.ticket_id}-${t.instance}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className={`instance-badge ${(t.instance || '').toLowerCase()}`}>{t.instance}</span>
                    <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.82rem' }}>#{t.ticket_id}</span>
                    <span style={{ fontSize: '0.82rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || '—'}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.entity_clean || '—'}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {techRows.length > 0 && (
              <Card>
                <SectionTitle action={<button className="btn-link" onClick={() => setActiveTab('technicians')} style={{ fontSize: '0.78rem' }}>Detalhes →</button>}>
                  Por Técnico (top 8)
                </SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {techRows.map(([name, count], i) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: '16px', textAlign: 'right', fontWeight: 600 }}>{i + 1}</span>
                      <div style={{ width: '130px', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name === '—' ? <em style={{ color: 'var(--text-muted)' }}>Sem técnico</em> : name}
                      </div>
                      <ProgressBar value={count} max={maxTech} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, width: '28px', textAlign: 'right', color: 'var(--primary)' }}>{count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {groupRows.length > 0 && (
              <Card>
                <SectionTitle action={<button className="btn-link" onClick={() => setActiveTab('categories')} style={{ fontSize: '0.78rem' }}>Detalhes →</button>}>
                  Por Grupo (top 8)
                </SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {groupRows.map(([name, count]) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '150px', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {name === '—' ? <em>Sem grupo</em> : name}
                      </div>
                      <ProgressBar value={count} max={maxGroup} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '28px', textAlign: 'right' }}>{count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {catRows.length > 0 && (
            <Card>
              <SectionTitle action={<button className="btn-link" onClick={() => setActiveTab('categories')} style={{ fontSize: '0.78rem' }}>Detalhes →</button>}>
                Tickets por Categoria (top 8)
              </SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {catRows.map(([name, count]) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '160px', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{name}</div>
                    <ProgressBar value={count} max={maxCat} color="#7c3aed" />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '32px', textAlign: 'right' }}>{count}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {entityRows.length > 0 && (
            <div>
              <SectionTitle>Tickets por Entidade</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                {entityRows.slice(0, 16).map(([name, s]) => (
                  <Link key={name} href={`/tickets?entity=${encodeURIComponent(name)}`} style={{ textDecoration: 'none' }}>
                    <div className="stat-card" style={{ cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{name}</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{s.total}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'technicians' && <TechniciansTab analytics={analytics} />}
      {activeTab === 'categories' && <CategoriesTab analytics={analytics} />}
      {activeTab === 'sla' && <SlaTab analytics={analytics} instance={instance} days={days} />}
      {activeTab === 'reports' && <ReportsTab instance={instance} days={days} analyticsData={analytics} />}
    </div>
  )
}
