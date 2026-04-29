'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { DoughnutChart, LineChart, BarChart } from './components/Charts'
import {
  processEntity, lastGroupLabel, fmt, calcDaysOverdue,
  build30DayTrend, getStatusConfig, calcHoursAgo, formatWaitTime, formatSeconds,
} from './lib/utils'

const PRIORITY_LABELS = { 1: 'Muito Baixa', 2: 'Baixa', 3: 'Média', 4: 'Alta', 5: 'Urgente', 6: 'Crítica' }
const PRIORITY_COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#f97316', '#dc2626', '#7f1d1d']

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

function StatCard({ label, value, color, href, sub }) {
  const inner = (
    <div className="stat-card">
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '1.9rem', fontWeight: 700, color, lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
  if (href) return <Link href={href} className="btn-link" style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>
  return inner
}

function SectionTitle({ children }) {
  return <h2 className="section-title">{children}</h2>
}

function Card({ children, style }) {
  return (
    <div className="card" style={style}>
      {children}
    </div>
  )
}

function resolutionRate(tickets, days) {
  const cutoff = new Date(Date.now() - days * 86400000)
  const inPeriod = tickets.filter(t => t.date_created && new Date(t.date_created) >= cutoff)
  const resolved = inPeriod.filter(t => t.status_key === 'solved' || t.status_key === 'closed')
  if (inPeriod.length === 0) return { rate: 0, resolved: 0, total: 0 }
  return { rate: Math.round((resolved.length / inPeriod.length) * 100), resolved: resolved.length, total: inPeriod.length }
}

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default function DashboardPage() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)
  const [fetchError, setFetchError] = useState(null)

  const load = useCallback(async () => {
    setFetchError(null)
    try {
      if (!sbUrl || !sbKey) {
        setFetchError('Supabase não configurado (verifique variáveis de ambiente)')
        return
      }
      const supabase = createClient(sbUrl, sbKey)
      const all = []
      const pageSize = 1000
      let from = 0

      // Limita a 1 ano para evitar timeout; inclui todos os ativos independente da data
      const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString()

      const COLS = [
        'ticket_id','instance','title','entity','status_id','status_key',
        'type_id','priority_id','is_sla_late','is_overdue_resolve','due_date',
        'date_created','date_mod','date_solved','technician','technician_id',
        'requester','requester_id','requester_fullname',
        'group_name','root_category','request_type',
        'resolution_duration','waiting_duration','is_deleted',
      ].join(',')

      while (true) {
        const { data, error } = await supabase
          .from('tickets_cache')
          .select(COLS)
          .in('instance', ['PETA', 'GMX'])
          .neq('is_deleted', true)
          .or(`status_key.not.in.(closed,solved),date_created.gte.${oneYearAgo}`)
          .order('date_mod', { ascending: false })
          .order('ticket_id', { ascending: false })
          .range(from, from + pageSize - 1)

        if (error) { setFetchError(error.message); break }
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < pageSize) break
        from += pageSize
      }

      setTickets(all)

      const { data: sync } = await supabase
        .from('sync_control')
        .select('last_sync')
        .order('last_sync', { ascending: false })
        .limit(1)
        .single()
      if (sync) setLastSync(sync.last_sync)
    } catch (e) {
      setFetchError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 10 * 60 * 1000)
    return () => clearInterval(iv)
  }, [load])

  // ── Stats ────────────────────────────────────────────────────────
  const total = tickets.length
  const byStatusKey = tickets.reduce((acc, t) => {
    const k = getStatusConfig(t.status_id, t.status_key).key
    acc[k] = (acc[k] || 0) + 1; return acc
  }, {})
  const slaLate = tickets.filter(t => t.is_sla_late || t.is_overdue_resolve).length
  const peta = tickets.filter(t => (t.instance || '').toUpperCase() === 'PETA')
  const gmx  = tickets.filter(t => (t.instance || '').toUpperCase() === 'GMX')

  // SLA Crítico Top 8
  const slaCritico = tickets
    .filter(t => (t.is_sla_late || t.is_overdue_resolve) && t.status_key !== 'closed' && t.status_key !== 'solved')
    .map(t => ({ ...t, daysOverdue: calcDaysOverdue(t.due_date) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 8)

  // Taxa de Resolução
  const rate7  = resolutionRate(tickets, 7)
  const rate30 = resolutionRate(tickets, 30)

  // Aprovação
  const approvalTickets = tickets.filter(t => t.status_id === 7 || t.status_key === 'pending-approval')

  // Tempo Médio em Pendência
  const pendingTickets = tickets.filter(t => t.status_key === 'pending' || t.status_id === 4)
  const avgPendingHours = pendingTickets.length > 0
    ? Math.round(pendingTickets.reduce((sum, t) => sum + calcHoursAgo(t.date_mod), 0) / pendingTickets.length)
    : 0

  // Categoria Raiz
  const catMap = {}
  for (const t of tickets) {
    const cat = t.root_category || 'Não categorizado'
    catMap[cat] = (catMap[cat] || 0) + 1
  }
  const catRows = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const maxCat  = catRows[0]?.[1] || 1

  // Técnico (top 10 — ranked list)
  const techMap = {}
  for (const t of tickets) {
      const tech = t.technician || '—'
    if (!techMap[tech]) techMap[tech] = 0
    techMap[tech]++
  }
  const techRows = Object.entries(techMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const maxTech  = techRows[0]?.[1] || 1

  // Entidade (top 8 com status breakdown)
  const entityMap = {}
  for (const t of tickets) {
    const e = processEntity(t.entity) || '—'
    if (!entityMap[e]) entityMap[e] = { total: 0, peta: 0, gmx: 0, new: 0, processing: 0, pending: 0 }
    entityMap[e].total++
    const statusKey = getStatusConfig(t.status_id, t.status_key).key
    if (statusKey === 'new') entityMap[e].new++
    else if (statusKey === 'processing') entityMap[e].processing++
    else if (statusKey === 'pending') entityMap[e].pending++
    if ((t.instance || '').toUpperCase() === 'PETA') entityMap[e].peta++
    else entityMap[e].gmx++
  }
  const entityRows = Object.entries(entityMap).sort((a, b) => b[1].total - a[1].total).slice(0, 8)

  // Grupo com status breakdown
  const groupMap = {}
  for (const t of tickets) {
    const g = lastGroupLabel(t.group_name)
    if (!groupMap[g]) groupMap[g] = { total: 0, new: 0, processing: 0, pending: 0, approval: 0 }
    groupMap[g].total++
    const statusKey = getStatusConfig(t.status_id, t.status_key).key
    if (statusKey === 'new') groupMap[g].new++
    else if (statusKey === 'processing') groupMap[g].processing++
    else if (statusKey === 'pending') groupMap[g].pending++
    else if (statusKey === 'approval') groupMap[g].approval++
  }
  const groupRows = Object.entries(groupMap).sort((a, b) => b[1].total - a[1].total).slice(0, 15)
  const maxGroup  = groupRows[0]?.[1].total || 1

  // Prioridade
  const prioMap = tickets.reduce((acc, t) => {
    const pid = t.priority_id || 3
    acc[pid] = (acc[pid] || 0) + 1; return acc
  }, {})

  // Tempo médio de resolução
  const resolvedWithTime = tickets.filter(t => (t.status_key === 'solved' || t.status_key === 'closed') && (t.resolution_duration || 0) > 0)
  const avgResolutionSec = resolvedWithTime.length > 0
    ? Math.round(resolvedWithTime.reduce((sum, t) => sum + (t.resolution_duration || 0), 0) / resolvedWithTime.length)
    : 0

  // Canal de requisição com status
  const reqTypeMap = {}
  for (const t of tickets) {
    const rt = t.request_type || 'Não informado'
    if (!reqTypeMap[rt]) reqTypeMap[rt] = { total: 0, new: 0, processing: 0, pending: 0 }
    reqTypeMap[rt].total++
    const statusKey = getStatusConfig(t.status_id, t.status_key).key
    if (statusKey === 'new') reqTypeMap[rt].new++
    else if (statusKey === 'processing') reqTypeMap[rt].processing++
    else if (statusKey === 'pending') reqTypeMap[rt].pending++
  }
  const reqTypeRows = Object.entries(reqTypeMap).sort((a, b) => b[1].total - a[1].total).slice(0, 8)
  const maxReqType  = reqTypeRows[0]?.[1].total || 1

  // Tipo de chamado
  const incidents = tickets.filter(t => t.type_id === 1).length
  const requests  = tickets.filter(t => t.type_id === 2).length

  // Prioridade — para BarChart vertical
  const prioEntries = Object.entries(prioMap).sort((a, b) => Number(a[0]) - Number(b[0]))
  const prioLabels  = prioEntries.map(([k]) => PRIORITY_LABELS[k] || `P${k}`)
  const prioData    = prioEntries.map(([, v]) => v)
  const prioColors  = prioEntries.map(([k]) => PRIORITY_COLORS[Number(k) - 1] || '#94a3b8')

  // Charts
  const trend = build30DayTrend(tickets)
  const lineDatasets = [
    { label: 'Abertos',  data: trend.opened, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3, pointRadius: 2 },
    { label: 'Fechados', data: trend.closed, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)',  fill: true, tension: 0.3, pointRadius: 2 },
  ]
  const chartStatusLabels = ['Novo', 'Em atendimento', 'Pendente', 'Aprovação', 'Solucionado', 'Fechado']
  const chartStatusData   = [byStatusKey.new||0, byStatusKey.processing||0, byStatusKey.pending||0, byStatusKey.approval||0, byStatusKey.solved||0, byStatusKey.closed||0]
  const chartStatusColors = ['#3b82f6', '#22c55e', '#f97316', '#7c3aed', '#6b7280', '#1f2937']

  const thTd = { padding: '8px 12px', fontSize: '0.82rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const thStyle = { ...thTd, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', background: 'var(--background)' }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
      <div className="spinner" />
    </div>
  )

  if (fetchError && tickets.length === 0) return (
    <div style={{ padding: '24px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      <span><strong>Erro ao carregar tickets:</strong> {fetchError}</span>
      <button onClick={load} style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0 }}>
        Tentar novamente
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {fetchError && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span><strong>Erro ao atualizar:</strong> {fetchError}</span>
          <button onClick={load} style={{ padding: '4px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0 }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* Page title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Central de Tickets</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>Visão geral dos tickets GLPI — Peta e GMX</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {lastSync && <span className="text-muted-sm">Última sincronização: {fmt(lastSync)}</span>}
          <button onClick={load} className="btn-primary">
            <RefreshIcon /> Atualizar
          </button>
        </div>
      </div>

       {/* Main stat cards */}
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '14px' }}>
         <StatCard label="Total"           value={total}                      color="var(--text-primary)" />
         <StatCard label="Incidentes"      value={incidents}                  color="#dc2626" href="/incidentes" />
         <StatCard label="Requisições"     value={requests}                   color="#3b82f6" href="/tickets" />
         <StatCard label="Em Atendimento"  value={byStatusKey.processing || 0} color="#16a34a" href="/tickets?status=processing" />
         <StatCard label="Pendentes"       value={byStatusKey.pending || 0}   color="#ea580c" href="/tickets?status=pending" />
         <StatCard label="Aprovação"       value={approvalTickets.length}     color="#7c3aed" href="/tickets?status=approval" />
         <StatCard label="SLA Excedido (Não resolvido)" value={slaCritico.length} color="#dc2626" href="/tickets?sla=late" />
         <StatCard label="SLA Excedido"    value={slaLate}                   color="#dc2626" href="/tickets?sla=late" />
         {avgResolutionSec > 0 && <StatCard label="Tempo Médio Resolução" value={formatSeconds(avgResolutionSec)} color="#6b7280" sub={`${resolvedWithTime.length} tickets`} />}
       </div>

       {/* Instance breakdown */}
       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
         {[{ label: 'Peta', list: peta, color: '#2563eb' }, { label: 'GMX', list: gmx, color: '#ea580c' }].map(({ label, list, color }) => {
           const byS = list.reduce((a, t) => { const k = getStatusConfig(t.status_id, t.status_key).key; a[k] = (a[k] || 0) + 1; return a }, {})
           return (
             <Card key={label} style={{ borderLeft: `4px solid ${color}` }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                 <span style={{ fontWeight: 700, fontSize: '1rem', color }}>{label}</span>
<span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{list.length} tickets</span>
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {[
                    { k: 'new', l: 'Novos', c: '#3b82f6' },
                    { k: 'processing', l: 'Em Atendimento', c: '#22c55e' },
                    { k: 'pending', l: 'Pendentes', c: '#f97316' },
                    { k: 'approval', l: 'Aprovação', c: '#7c3aed' },
                    { k: 'solved', l: 'Solucionados', c: '#6b7280' },
                    { k: 'closed', l: 'Fechados', c: '#374151' },
                  ].map(({ k, l, c }) => (
                    <div key={k} style={{ textAlign: 'center', minWidth: '70px' }}>
                      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: c }}>{byS[k] || 0}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{l}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>

       {/* Charts row — Status + Trend */}
       <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
         <Card>
           <SectionTitle>Tickets por Status</SectionTitle>
           <DoughnutChart labels={chartStatusLabels} data={chartStatusData} colors={chartStatusColors} height={200} />
         </Card>
         <Card>
           <SectionTitle>Últimos 30 Dias</SectionTitle>
           <LineChart labels={trend.labels} datasets={lineDatasets} height={200} />
         </Card>
       </div>

{/* Taxa de Resolução + Tempo em Pendência + Canal de Requisição em colunas */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              <StatCard label="Taxa de Resolução (7d)"   value={`${rate7.rate}%`}  color="#16a34a" sub={`${rate7.resolved} / ${rate7.total} tickets`} />
              <StatCard label="Taxa de Resolução (30d)"  value={`${rate30.rate}%`} color="#16a34a" sub={`${rate30.resolved} / ${rate30.total} tickets`} />
              <StatCard label="Tempo Médio em Pendência" value={formatWaitTime(avgPendingHours)} color="#ea580c" sub={`${pendingTickets.length} tickets pendentes`} />
            </div>
          </Card>
          {reqTypeRows.length > 1 && (
            <Card>
              <SectionTitle>Canal de Requisição</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {reqTypeRows.map(([name, stats]) => (
                  <div key={name} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <div style={{ width: '110px', fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500 }}>{name}</div>
                      <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(stats.total / maxReqType) * 100}%`, background: 'var(--primary)', borderRadius: '9999px' }} />
                      </div>
                      <span style={{ fontSize: '0.77rem', fontWeight: 600, width: '24px', textAlign: 'right' }}>{stats.total}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.68rem', color: 'var(--text-secondary)', paddingLeft: '2px' }}>
                      {stats.new > 0 && <span>🆕 {stats.new}</span>}
                      {stats.processing > 0 && <span>⚙️ {stats.processing}</span>}
                      {stats.pending > 0 && <span>⏳ {stats.pending}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

       {/* SLA Crítico Top 8 */}
       {slaCritico.length > 0 && (
         <Card>
           <SectionTitle>SLA Crítico (Top 8)</SectionTitle>
           <div style={{ overflowX: 'auto' }}>
             <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
               <thead>
                 <tr>
                   {['ID', 'Título', 'Entidade', 'Status', 'Solicitante', 'Técnico', 'Atraso'].map(h => (
                     <th key={h} style={thStyle}>{h}</th>
                   ))}
                 </tr>
               </thead>
               <tbody>
                 {slaCritico.map((t, i) => (
                   <tr key={`${t.ticket_id}-${t.instance}`} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                     <td style={{ ...thTd, fontWeight: 700, color: 'var(--primary)' }}>#{t.ticket_id}</td>
                     <td style={{ ...thTd, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title || '—'}</td>
                     <td style={{ ...thTd, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{processEntity(t.entity)}</td>
                     <td style={thTd}>
                       <span className={`status-badge ${getStatusConfig(t.status_id, t.status_key).key}`}>
                         {getStatusConfig(t.status_id, t.status_key).label}
                       </span>
                     </td>
                     <td style={thTd}>{t.requester_fullname || t.requester || <em style={{ color: 'var(--text-muted)' }}>Sem solicitante</em>}</td>
                     <td style={thTd}>{t.technician || <em style={{ color: 'var(--text-muted)' }}>Sem técnico</em>}</td>
                     <td style={{ ...thTd, color: '#dc2626', fontWeight: 700 }}>
                       {t.daysOverdue > 0 ? `${t.daysOverdue}d atraso` : '< 1d'}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
         </Card>
)}

       {/* Tickets em Aprovação */}
      {approvalTickets.length > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <SectionTitle>Tickets em Aprovação</SectionTitle>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: '#7c3aed', marginTop: '-10px' }}>{approvalTickets.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {approvalTickets.slice(0, 5).map(t => (
              <div key={`${t.ticket_id}-${t.instance}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.82rem', flexShrink: 0 }}>#{t.ticket_id}</span>
                <span style={{ fontSize: '0.82rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || '—'}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{processEntity(t.entity)}</span>
              </div>
            ))}
            {approvalTickets.length > 5 && (
              <Link href="/tickets?status=approval" style={{ fontSize: '0.78rem', color: 'var(--primary)', marginTop: '4px' }}>
                Ver todos os {approvalTickets.length} tickets em aprovação →
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Categoria Raiz + Prioridade (BarChart) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        {catRows.length > 0 && (
          <Card>
            <SectionTitle>Tickets por Categoria Raiz</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {catRows.map(([name, count]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '160px', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--text-secondary)' }}>{name}</div>
                  <div style={{ flex: 1, height: '10px', background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '9999px', width: `${(count / maxCat) * 100}%`, background: 'linear-gradient(90deg, var(--primary), var(--primary-dark))' }} />
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '28px', textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
        {prioData.length > 0 && (
          <Card>
            <SectionTitle>Distribuição por Prioridade</SectionTitle>
            <BarChart labels={prioLabels} data={prioData} colors={prioColors} height={220} horizontal={false} />
          </Card>
        )}
      </div>

      {/* Técnicos — ranked list (top 10) */}
      {techRows.length > 0 && (
        <Card>
          <SectionTitle>Tickets por Técnico (top {techRows.length})</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '8px 32px' }}>
            {techRows.map(([name, count], i) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: '18px', textAlign: 'right', flexShrink: 0, fontWeight: 600 }}>{i + 1}</span>
                <div style={{ width: '150px', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {name === '—' ? <em style={{ color: 'var(--text-muted)' }}>Sem técnico</em> : name}
                </div>
                <div style={{ flex: 1, height: '10px', background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '9999px', width: `${(count / maxTech) * 100}%`, background: 'linear-gradient(90deg, var(--primary), var(--primary-dark))' }} />
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, width: '28px', textAlign: 'right', color: 'var(--primary)', flexShrink: 0 }}>{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Entity cards — top 8 com status */}
      {entityRows.length > 0 && (
        <div>
          <SectionTitle>Tickets por Entidade (top 8)</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
            {entityRows.slice(0, 8).map(([name, s]) => (
              <Card key={name} style={{ padding: '12px 14px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '6px' }}>{s.total}</div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  {s.new > 0 && <span>🆕 {s.new}</span>}
                  {s.processing > 0 && <span>⚙️ {s.processing}</span>}
                  {s.pending > 0 && <span>⏳ {s.pending}</span>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Por Grupo com status */}
      {groupRows.length > 0 && (
        <Card>
          <SectionTitle>Tickets por Grupo (top {groupRows.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {groupRows.map(([name, stats]) => (
              <div key={name} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <div style={{ width: '160px', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {name === '—' ? <em>Sem grupo</em> : name}
                  </div>
                  <div style={{ flex: 1, height: '8px', background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '9999px', width: `${(stats.total / maxGroup) * 100}%`, background: 'linear-gradient(90deg, var(--primary), var(--primary-dark))' }} />
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '32px', textAlign: 'right' }}>{stats.total}</span>
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem', color: 'var(--text-secondary)', paddingLeft: '4px' }}>
                  {stats.new > 0 && <span>🆕 {stats.new}</span>}
                  {stats.processing > 0 && <span>⚙️ {stats.processing}</span>}
                  {stats.pending > 0 && <span>⏳ {stats.pending}</span>}
                  {stats.approval > 0 && <span>✓ {stats.approval}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

    </div>
  )
}
