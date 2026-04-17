'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase/client'
import { DoughnutChart, LineChart } from './components/Charts'
import {
  processEntity, lastGroupLabel, fmt, calcDaysOverdue,
  build30DayTrend, getStatusConfig, calcHoursAgo, formatWaitTime,
} from './lib/utils'

const PRIORITY_LABELS = { 1: 'Muito Baixa', 2: 'Baixa', 3: 'Média', 4: 'Alta', 5: 'Urgente', 6: 'Crítica' }
const PRIORITY_COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#f97316', '#dc2626', '#7f1d1d']

function StatCard({ label, value, color, href, sub }) {
  const inner = (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '1.9rem', fontWeight: 700, color, lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
  if (href) return <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>
  return inner
}

function SectionTitle({ children }) {
  return <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>{children}</h2>
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)',
      ...style,
    }}>
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

export default function DashboardPage() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)

  const load = useCallback(async () => {
    try {
      const sb = getSupabaseClient()
      if (!sb) return
      const { data } = await sb
        .from('tickets_cache')
        .select('ticket_id,title,entity,category,root_category,status_id,status_key,status_name,group_name,technician,is_sla_late,is_overdue_resolve,date_created,date_mod,due_date,instance,priority_id')
        .order('date_mod', { ascending: false })
      setTickets(data || [])
      const { data: sync } = await sb.from('sync_control').select('last_sync').order('last_sync', { ascending: false }).limit(1).single()
      if (sync) setLastSync(sync.last_sync)
    } catch { /* no-op */ } finally { setLoading(false) }
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

  // Técnico
  const techMap = {}
  for (const t of tickets) {
    const tech = t.technician || '—'
    if (!techMap[tech]) techMap[tech] = { total: 0, new: 0, processing: 0, pending: 0, approval: 0, solved: 0, closed: 0, peta: 0, gmx: 0 }
    techMap[tech].total++
    const sk = getStatusConfig(t.status_id, t.status_key).key
    if (techMap[tech][sk] !== undefined) techMap[tech][sk]++
    if ((t.instance || '').toUpperCase() === 'PETA') techMap[tech].peta++
    else techMap[tech].gmx++
  }
  const techRows = Object.entries(techMap).sort((a, b) => b[1].total - a[1].total).slice(0, 20)

  // Entidade
  const entityMap = {}
  for (const t of tickets) {
    const e = processEntity(t.entity) || '—'
    if (!entityMap[e]) entityMap[e] = { total: 0, peta: 0, gmx: 0 }
    entityMap[e].total++
    if ((t.instance || '').toUpperCase() === 'PETA') entityMap[e].peta++
    else entityMap[e].gmx++
  }
  const entityRows = Object.entries(entityMap).sort((a, b) => b[1].total - a[1].total).slice(0, 12)

  // Grupo
  const groupMap = {}
  for (const t of tickets) {
    const g = lastGroupLabel(t.group_name)
    groupMap[g] = (groupMap[g] || 0) + 1
  }
  const groupRows = Object.entries(groupMap).sort((a, b) => b[1] - a[1]).slice(0, 15)
  const maxGroup  = groupRows[0]?.[1] || 1

  // Prioridade
  const prioMap = tickets.reduce((acc, t) => {
    const pid = t.priority_id || 3
    acc[pid] = (acc[pid] || 0) + 1; return acc
  }, {})
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Page title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>Visão geral dos tickets GLPI — Peta e GMX</p>
        </div>
        {lastSync && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Última sincronização: {fmt(lastSync)}</span>}
      </div>

      {/* Main stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '14px' }}>
        <StatCard label="Total"          value={total}                      color="var(--text-primary)" />
        <StatCard label="Em Atendimento" value={byStatusKey.processing || 0} color="#16a34a" href="/tickets?status=processing" />
        <StatCard label="Pendentes"      value={byStatusKey.pending || 0}    color="#ea580c" href="/tickets?status=pending" />
        <StatCard label="Aprovação"      value={approvalTickets.length}      color="#7c3aed" href="/tickets?status=approval" />
        <StatCard label="SLA Excedido"   value={slaLate}                    color="#dc2626" href="/tickets?sla=late" />
      </div>

      {/* Instance breakdown */}
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

      {/* Charts row */}
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

      {/* Taxa de Resolução + Tempo em Pendência */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
        <StatCard label="Taxa de Resolução (7d)" value={`${rate7.rate}%`}  color="#16a34a" sub={`${rate7.resolved} / ${rate7.total} tickets`} />
        <StatCard label="Taxa de Resolução (30d)" value={`${rate30.rate}%`} color="#16a34a" sub={`${rate30.resolved} / ${rate30.total} tickets`} />
        <StatCard label="Tempo Médio em Pendência" value={formatWaitTime(avgPendingHours)} color="#ea580c" sub={`${pendingTickets.length} tickets pendentes`} />
      </div>

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

      {/* Categoria Raiz + Prioridade */}
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
            <DoughnutChart labels={prioLabels} data={prioData} colors={prioColors} height={200} />
          </Card>
        )}
      </div>

      {/* By Technician */}
      {techRows.length > 0 && (
        <Card>
          <SectionTitle>Tickets por Técnico (top {techRows.length})</SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  {['Técnico', 'Total', 'Novo', 'Em Atend.', 'Pendente', 'Aprovação', 'Solucionado', 'Fechado', 'PETA', 'GMX'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {techRows.map(([name, s], i) => (
                  <tr key={name} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                    <td style={{ ...thTd, fontWeight: 600 }}>{name === '—' ? <em style={{ color: 'var(--text-muted)' }}>Sem técnico</em> : name}</td>
                    <td style={{ ...thTd, fontWeight: 700 }}>{s.total}</td>
                    <td style={{ ...thTd, color: '#2563eb' }}>{s.new}</td>
                    <td style={{ ...thTd, color: '#16a34a' }}>{s.processing}</td>
                    <td style={{ ...thTd, color: '#ea580c' }}>{s.pending}</td>
                    <td style={{ ...thTd, color: '#7c3aed' }}>{s.approval}</td>
                    <td style={{ ...thTd, color: '#52525b' }}>{s.solved}</td>
                    <td style={{ ...thTd, color: '#374151' }}>{s.closed}</td>
                    <td style={{ ...thTd, color: '#2563eb' }}>{s.peta}</td>
                    <td style={{ ...thTd, color: '#ea580c' }}>{s.gmx}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Entity cards */}
      {entityRows.length > 0 && (
        <div>
          <SectionTitle>Tickets por Entidade (top {entityRows.length})</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
            {entityRows.map(([name, s]) => (
              <Card key={name} style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{s.total}</div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px', fontSize: '0.75rem' }}>
                  <span style={{ color: '#2563eb' }}>P:{s.peta}</span>
                  <span style={{ color: '#ea580c' }}>G:{s.gmx}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* By Group */}
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

      {/* Quick links */}
      <Card>
        <SectionTitle>Acessos Rápidos</SectionTitle>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { href: '/tickets',    label: 'Monitor.Tickets' },
            { href: '/incidentes', label: 'Incidentes' },
            { href: '/kanban',     label: 'Kanban' },
            { href: '/relatorios', label: 'Relatórios' },
          ].map(l => (
            <Link key={l.href} href={l.href} style={{
              padding: '8px 14px', borderRadius: 'var(--radius-md)',
              background: 'var(--background)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500,
            }}>
              {l.label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}
