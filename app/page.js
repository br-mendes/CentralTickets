'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { getSupabaseClient } from '../lib/supabase/client'
import { DoughnutChart, LineChart, BarChart } from './components/Charts'
import {
  processEntity, lastGroupLabel, fmt, calcDaysOverdue,
  build30DayTrend, getStatusConfig, calcHoursAgo, formatWaitTime, formatSeconds,
} from './lib/utils'

// FastAPI backend URL
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

// Only the columns the dashboard actually needs — avoids over-fetching
const TICKET_COLS = 'ticket_id,instance,title,status_id,status_key,type_id,priority_id,entity,technician,group_name,request_type,date_created,date_mod,is_sla_late,is_overdue_resolve,due_date,resolution_duration,root_category'

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

function calculateSLAMetrics(tickets) {
  const resolved = tickets.filter(t => t.status_key === 'solved' || t.status_key === 'closed')
  if (resolved.length === 0) return { onTime: 0, overdue: 0, onTimeCount: 0, overdueCount: 0 }

  const onTimeCount = resolved.filter(t => !t.is_sla_late && !t.is_overdue_resolve).length
  const overdueCount = resolved.filter(t => t.is_sla_late || t.is_overdue_resolve).length

  return {
    onTime: Math.round((onTimeCount / resolved.length) * 100),
    overdue: Math.round((overdueCount / resolved.length) * 100),
    onTimeCount,
    overdueCount,
  }
}

function calculateDailyAverage(tickets, days = 30) {
  const cutoff = new Date(Date.now() - days * 86400000)
  const inPeriod = tickets.filter(t => t.date_created && new Date(t.date_created) >= cutoff)
  return Math.round((inPeriod.length / days) * 10) / 10
}

function groupByTechnician(tickets) {
  const techMap = {}
  for (const t of tickets) {
    const tech = t.technician || 'Não atribuído'
    if (!techMap[tech]) {
      techMap[tech] = { total: 0, byStatus: {}, received: 0, resolved: 0 }
    }
    techMap[tech].total += 1
    techMap[tech].byStatus[t.status_key] = (techMap[tech].byStatus[t.status_key] || 0) + 1
    techMap[tech].received += 1
    if (t.status_key === 'solved' || t.status_key === 'closed') {
      techMap[tech].resolved += 1
    }
  }
  return Object.entries(techMap)
    .map(([tech, data]) => ({ tech, ...data }))
    .sort((a, b) => b.total - a.total)
}

function groupByCategory(tickets) {
  const catMap = {}
  for (const t of tickets) {
    const cat = t.root_category || 'Sem categoria'
    if (!catMap[cat]) {
      catMap[cat] = { totalDuration: 0, count: 0, resolved: 0, avgDuration: 0 }
    }
    catMap[cat].count += 1
    if (t.resolution_duration) {
      catMap[cat].totalDuration += t.resolution_duration
    }
    if (t.status_key === 'solved' || t.status_key === 'closed') {
      catMap[cat].resolved += 1
    }
  }

  return Object.entries(catMap)
    .map(([cat, data]) => ({
      category: cat,
      avgDuration: data.count > 0 ? Math.round((data.totalDuration / data.count) / 3600) : 0,
      resolved: data.resolved,
      total: data.count,
    }))
    .sort((a, b) => b.total - a.total)
}

export default function DashboardPage() {
  const [tickets, setTickets] = useState([])
  const [instanceCounts, setInstanceCounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      // Try FastAPI backend first, fallback to Supabase
      try {
        const [ticketsRes, statsRes, trendRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/tickets?instances=PETA,GMX&limit=5000`),
          fetch(`${BACKEND_URL}/api/dashboard/stats`),
          fetch(`${BACKEND_URL}/api/dashboard/trend`),
        ])

        if (ticketsRes.ok && statsRes.ok && trendRes.ok) {
          const ticketsData = await ticketsRes.json()
          const statsData = await statsRes.json()
          const trendData = await trendRes.json()

          setTickets(ticketsData.data || [])
          setInstanceCounts(ticketsData.data || [])
          console.log('✅ Dashboard carregado via FastAPI Backend (Polars)', { stats: statsData })
        } else {
          throw new Error('Backend API error')
        }
      } catch (backendError) {
        // Fallback to Supabase se backend falhar
        console.warn('⚠️ Backend indisponível, usando Supabase', backendError)
        const sb = getSupabaseClient()
        if (!sb) return

        const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()

        const [activeRes, recentRes, recentlyClosedRes, syncRes, countRes] = await Promise.all([
          sb.from('tickets_cache')
            .select(TICKET_COLS)
            .in('instance', ['PETA', 'GMX'])
            .eq('is_deleted', false)
            .neq('status_key', 'closed')
            .neq('status_key', 'solved')
            .order('date_mod', { ascending: false })
            .range(0, 4999),
          sb.from('tickets_cache')
            .select(TICKET_COLS)
            .in('instance', ['PETA', 'GMX'])
            .eq('is_deleted', false)
            .gte('date_created', cutoff)
            .order('date_created', { ascending: false })
            .range(0, 1999),
          sb.from('tickets_cache')
            .select(TICKET_COLS)
            .in('instance', ['PETA', 'GMX'])
            .eq('is_deleted', false)
            .in('status_key', ['closed', 'solved'])
            .gte('date_mod', cutoff)
            .order('date_mod', { ascending: false })
            .range(0, 1999),
          sb.from('sync_control')
            .select('last_sync')
            .order('last_sync', { ascending: false })
            .limit(1)
            .maybeSingle(),
          sb.from('tickets_cache')
            .select('instance,status_id,status_key')
            .in('instance', ['PETA', 'GMX'])
            .eq('is_deleted', false)
            .range(0, 49999),
        ])

        const seen = new Set()
        const merged = []
        for (const t of [
          ...(activeRes.data || []),
          ...(recentRes.data || []),
          ...(recentlyClosedRes.data || []),
        ]) {
          const key = `${t.instance}:${t.ticket_id}`
          if (!seen.has(key)) { seen.add(key); merged.push(t) }
        }

        setTickets(merged)
        setInstanceCounts(countRes.data || [])
        if (syncRes.data) setLastSync(syncRes.data.last_sync)
      }
    } catch (e) {
      console.error('Dashboard load failed', e)
      setLoadError('Falha ao carregar tickets. Verifique a conexão e tente novamente.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 10 * 60 * 1000)
    return () => clearInterval(iv)
  }, [load])

  // ── Stats (memoized — recompute only when tickets array changes) ──
  const {
    total, byStatusKey, slaLate, peta, gmx, petaByStatus, gmxByStatus, slaCritico,
    rate7, rate30, approvalTickets, pendingTickets, avgPendingHours,
    catRows, maxCat, techRows, maxTech, entityRows,
    groupRows, maxGroup, resolvedWithTime, avgResolutionSec,
    reqTypeRows, maxReqType, incidents, requests,
    prioLabels, prioData, prioColors,
    trend, lineDatasets, chartStatusLabels, chartStatusData, chartStatusColors,
    slaMetrics, dailyAverage, technicianData, categoryData,
  } = useMemo(() => {
    const total = tickets.length
    const byStatusKey = tickets.reduce((acc, t) => {
      const k = getStatusConfig(t.status_id, t.status_key).key
      acc[k] = (acc[k] || 0) + 1; return acc
    }, {})
    const slaLate = tickets.filter(t => t.is_sla_late || t.is_overdue_resolve).length

    // Accurate per-instance counts from the lightweight full-table query
    const petaAll = instanceCounts.filter(t => (t.instance || '').toUpperCase() === 'PETA')
    const gmxAll  = instanceCounts.filter(t => (t.instance || '').toUpperCase() === 'GMX')
    const petaByStatus = petaAll.reduce((a, t) => {
      const k = getStatusConfig(t.status_id, t.status_key).key; a[k] = (a[k] || 0) + 1; return a
    }, {})
    const gmxByStatus = gmxAll.reduce((a, t) => {
      const k = getStatusConfig(t.status_id, t.status_key).key; a[k] = (a[k] || 0) + 1; return a
    }, {})
    const peta = petaAll
    const gmx  = gmxAll

    const slaCritico = tickets
      .filter(t => (t.is_sla_late || t.is_overdue_resolve) && t.status_key !== 'closed' && t.status_key !== 'solved')
      .map(t => ({ ...t, daysOverdue: calcDaysOverdue(t.due_date) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 8)

    const rate7  = resolutionRate(tickets, 7)
    const rate30 = resolutionRate(tickets, 30)

    const approvalTickets = tickets.filter(t => t.status_id === 7 || t.status_key === 'pending-approval')

    const pendingTickets = tickets.filter(t => t.status_key === 'pending' || t.status_id === 4)
    const avgPendingHours = pendingTickets.length > 0
      ? Math.round(pendingTickets.reduce((sum, t) => sum + calcHoursAgo(t.date_mod), 0) / pendingTickets.length)
      : 0

    const catMap = {}
    for (const t of tickets) {
      const cat = t.root_category || 'Não categorizado'
      catMap[cat] = (catMap[cat] || 0) + 1
    }
    const catRows = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
    const maxCat  = catRows[0]?.[1] || 1

    const techMap = {}
    for (const t of tickets) {
      const tech = t.technician || '—'
      techMap[tech] = (techMap[tech] || 0) + 1
    }
    const techRows = Object.entries(techMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
    const maxTech  = techRows[0]?.[1] || 1

    const entityMap = {}
    for (const t of tickets) {
      const e = processEntity(t.entity) || '—'
      if (!entityMap[e]) entityMap[e] = { total: 0, peta: 0, gmx: 0 }
      entityMap[e].total++
      if ((t.instance || '').toUpperCase() === 'PETA') entityMap[e].peta++
      else entityMap[e].gmx++
    }
    const entityRows = Object.entries(entityMap).sort((a, b) => b[1].total - a[1].total).slice(0, 16)

    const groupMap = {}
    for (const t of tickets) {
      const g = lastGroupLabel(t.group_name)
      groupMap[g] = (groupMap[g] || 0) + 1
    }
    const groupRows = Object.entries(groupMap).sort((a, b) => b[1] - a[1]).slice(0, 15)
    const maxGroup  = groupRows[0]?.[1] || 1

    const prioMap = tickets.reduce((acc, t) => {
      const pid = t.priority_id || 3
      acc[pid] = (acc[pid] || 0) + 1; return acc
    }, {})

    const resolvedWithTime = tickets.filter(t => (t.status_key === 'solved' || t.status_key === 'closed') && (t.resolution_duration || 0) > 0)
    const avgResolutionSec = resolvedWithTime.length > 0
      ? Math.round(resolvedWithTime.reduce((sum, t) => sum + (t.resolution_duration || 0), 0) / resolvedWithTime.length)
      : 0

    const reqTypeMap = {}
    for (const t of tickets) {
      const rt = t.request_type || 'Não informado'
      reqTypeMap[rt] = (reqTypeMap[rt] || 0) + 1
    }
    const reqTypeRows = Object.entries(reqTypeMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
    const maxReqType  = reqTypeRows[0]?.[1] || 1

    const incidents = tickets.filter(t => t.type_id === 1).length
    const requests  = tickets.filter(t => t.type_id === 2).length

    const prioEntries = Object.entries(prioMap).sort((a, b) => Number(a[0]) - Number(b[0]))
    const prioLabels  = prioEntries.map(([k]) => PRIORITY_LABELS[k] || `P${k}`)
    const prioData    = prioEntries.map(([, v]) => v)
    const prioColors  = prioEntries.map(([k]) => PRIORITY_COLORS[Number(k) - 1] || '#94a3b8')

    const trend = build30DayTrend(tickets)
    const lineDatasets = [
      { label: 'Abertos',  data: trend.opened, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3, pointRadius: 2 },
      { label: 'Fechados', data: trend.closed, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)',  fill: true, tension: 0.3, pointRadius: 2 },
    ]
    const chartStatusLabels = ['Novo', 'Em atendimento', 'Pendente', 'Aprovação', 'Solucionado', 'Fechado']
    const chartStatusData   = [byStatusKey.new||0, byStatusKey.processing||0, byStatusKey.pending||0, byStatusKey.approval||0, byStatusKey.solved||0, byStatusKey.closed||0]
    const chartStatusColors = ['#3b82f6', '#22c55e', '#f97316', '#7c3aed', '#6b7280', '#1f2937']

    // New metrics
    const slaMetrics = calculateSLAMetrics(tickets)
    const dailyAverage = calculateDailyAverage(tickets)
    const technicianData = groupByTechnician(tickets)
    const categoryData = groupByCategory(tickets)

    return {
      total, byStatusKey, slaLate, peta, gmx, petaByStatus, gmxByStatus, slaCritico,
      rate7, rate30, approvalTickets, pendingTickets, avgPendingHours,
      catRows, maxCat, techRows, maxTech, entityRows,
      groupRows, maxGroup, resolvedWithTime, avgResolutionSec,
      reqTypeRows, maxReqType, incidents, requests,
      prioLabels, prioData, prioColors,
      trend, lineDatasets, chartStatusLabels, chartStatusData, chartStatusColors,
      slaMetrics, dailyAverage, technicianData, categoryData,
    }
  }, [tickets, instanceCounts])

  const thTd = { padding: '8px 12px', fontSize: '0.82rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const thStyle = { ...thTd, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', background: 'var(--background)' }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
      <div className="spinner" />
    </div>
  )

  if (loadError) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '16px' }}>
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-lg)', padding: '16px 24px', color: '#dc2626', fontSize: '0.9rem', maxWidth: '480px', textAlign: 'center' }}>
        {loadError}
      </div>
      <button onClick={load} className="btn-primary">Tentar novamente</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

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

       {/* Primary KPIs */}
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '14px' }}>
         <StatCard label="Total" value={total} color="var(--text-primary)" />
         <StatCard label="Incidentes" value={incidents} color="#dc2626" href="/incidentes" />
         <StatCard label="Requisições" value={requests} color="#3b82f6" href="/tickets" />
         <StatCard label="Média/Dia" value={dailyAverage} color="#16a34a" sub="últimos 30 dias" />
       </div>

       {/* SLA & Resolution Metrics */}
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px' }}>
         <Card style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white' }}>
           <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.9, marginBottom: '8px' }}>RESOLVIDO NO PRAZO</div>
           <div style={{ fontSize: '2rem', fontWeight: 700 }}>{slaMetrics.onTime}%</div>
           <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{slaMetrics.onTimeCount} tickets</div>
         </Card>
         <Card style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: 'white' }}>
           <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.9, marginBottom: '8px' }}>FORA DO PRAZO</div>
           <div style={{ fontSize: '2rem', fontWeight: 700 }}>{slaMetrics.overdue}%</div>
           <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{slaMetrics.overdueCount} tickets</div>
         </Card>
         <Card style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: 'white' }}>
           <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.9, marginBottom: '8px' }}>EM ATENDIMENTO</div>
           <div style={{ fontSize: '2rem', fontWeight: 700 }}>{byStatusKey.processing || 0}</div>
           <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>tickets ativos</div>
         </Card>
         {avgResolutionSec > 0 && (
           <Card style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white' }}>
             <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.9, marginBottom: '8px' }}>TEMPO MÉDIO</div>
             <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{Math.round(avgResolutionSec / 3600)}h</div>
             <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{resolvedWithTime.length} resolvidos</div>
           </Card>
         )}
       </div>

       {/* Instance breakdown */}
       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
         {[
          { label: 'Peta', list: peta, byS: petaByStatus, color: '#2563eb' },
          { label: 'GMX',  list: gmx,  byS: gmxByStatus,  color: '#ea580c' },
       ].map(({ label, list, byS, color }) => {
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {reqTypeRows.map(([name, count]) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '130px', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--text-secondary)' }}>{name}</div>
                    <div style={{ flex: 1, height: '8px', background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(count / maxReqType) * 100}%`, background: 'var(--primary)', borderRadius: '9999px' }} />
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '28px', textAlign: 'right' }}>{count}</span>
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
                   {['ID', 'Título', 'Entidade', 'Status', 'Técnico', 'Atraso'].map(h => (
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

      {/* Análise Detalhada de Técnicos */}
      {technicianData.length > 0 && (
        <Card>
          <SectionTitle>Análise de Técnicos - Status & Resoluções</SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--background)' }}>
                  <th style={thStyle}>Técnico</th>
                  <th style={thStyle}>Recebidos</th>
                  <th style={thStyle}>Resolvidos</th>
                  <th style={thStyle}>Taxa Resolução</th>
                  <th style={thStyle}>Novo</th>
                  <th style={thStyle}>Atendimento</th>
                  <th style={thStyle}>Pendente</th>
                  <th style={thStyle}>Aprovação</th>
                </tr>
              </thead>
              <tbody>
                {technicianData.slice(0, 15).map(t => {
                  const rate = t.received > 0 ? Math.round((t.resolved / t.received) * 100) : 0
                  return (
                    <tr key={t.tech} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={thTd}>
                        {t.tech === 'Não atribuído' ? <em style={{ color: 'var(--text-muted)' }}>Sem técnico</em> : t.tech}
                      </td>
                      <td style={thTd}><strong>{t.received}</strong></td>
                      <td style={thTd}><strong style={{ color: '#16a34a' }}>{t.resolved}</strong></td>
                      <td style={thTd}>
                        <span style={{
                          background: rate >= 80 ? '#dcfce7' : rate >= 60 ? '#fef3c7' : '#fee2e2',
                          color: rate >= 80 ? '#166534' : rate >= 60 ? '#92400e' : '#991b1b',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>{rate}%</span>
                      </td>
                      <td style={thTd}>{t.byStatus.new || 0}</td>
                      <td style={thTd}>{t.byStatus.processing || 0}</td>
                      <td style={thTd}>{t.byStatus.pending || 0}</td>
                      <td style={thTd}>{t.byStatus.approval || 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Análise Detalhada de Categorias */}
      {categoryData.length > 0 && (
        <Card>
          <SectionTitle>Análise de Categorias - Duração & Resoluções</SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--background)' }}>
                  <th style={thStyle}>Categoria Raiz</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Resolvidos</th>
                  <th style={thStyle}>Taxa Resolução</th>
                  <th style={thStyle}>Duração Média (horas)</th>
                </tr>
              </thead>
              <tbody>
                {categoryData.slice(0, 15).map(cat => {
                  const rate = cat.total > 0 ? Math.round((cat.resolved / cat.total) * 100) : 0
                  return (
                    <tr key={cat.category} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={thTd}>
                        {cat.category === 'Sem categoria' ? <em style={{ color: 'var(--text-muted)' }}>Sem categoria</em> : cat.category}
                      </td>
                      <td style={thTd}><strong>{cat.total}</strong></td>
                      <td style={thTd}><strong style={{ color: '#16a34a' }}>{cat.resolved}</strong></td>
                      <td style={thTd}>
                        <span style={{
                          background: rate >= 80 ? '#dcfce7' : rate >= 60 ? '#fef3c7' : '#fee2e2',
                          color: rate >= 80 ? '#166534' : rate >= 60 ? '#92400e' : '#991b1b',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>{rate}%</span>
                      </td>
                      <td style={thTd}>
                        <strong style={{ color: '#f59e0b' }}>{cat.avgDuration}h</strong>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Entity cards */}
      {entityRows.length > 0 && (
        <div>
          <SectionTitle>Tickets por Entidade (top {Math.min(entityRows.length, 16)})</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
            {entityRows.slice(0, 16).map(([name, s]) => (
              <Card key={name} style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{s.total}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Por Grupo */}
      {groupRows.length > 0 && (
        <Card>
          <SectionTitle>Tickets por Grupo (top {groupRows.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {groupRows.map(([name, count]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '180px', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--text-secondary)' }}>
                  {name === '—' ? <em>Sem grupo</em> : name}
                </div>
                <div style={{ flex: 1, height: '10px', background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '9999px', width: `${(count / maxGroup) * 100}%`, background: 'linear-gradient(90deg, var(--primary), var(--primary-dark))' }} />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '28px', textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

    </div>
  )
}
