'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase/client'
import { DoughnutChart, LineChart } from './components/Charts'
import {
  processEntity, lastGroupLabel, fmt, calcDaysOverdue,
  build30DayTrend, getStatusConfig,
} from './lib/utils'

const STATUS_ORDER = ['new', 'processing', 'pending', 'approval', 'solved', 'closed']

function StatCard({ label, value, color, href, sub }) {
  const inner = (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      boxShadow: 'var(--shadow-sm)',
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
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      boxShadow: 'var(--shadow-sm)',
      ...style,
    }}>
      {children}
    </div>
  )
}

export default function DashboardPage() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)

  const load = useCallback(async () => {
    try {
      const sb = getSupabaseClient()
      const { data } = await sb
        .from('tickets_cache')
        .select('ticket_id,title,entity,category,root_category,status_id,status_key,status_name,group_name,technician,is_sla_late,is_overdue_resolve,date_created,date_mod,due_date,instance')
        .order('date_mod', { ascending: false })

      setTickets(data || [])

      const { data: sync } = await sb.from('sync_control').select('last_sync').order('last_sync', { ascending: false }).limit(1).single()
      if (sync) setLastSync(sync.last_sync)
    } catch { /* no-op */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Computed stats ───────────────────────────────────────────────
  const total = tickets.length
  const byStatusKey = tickets.reduce((acc, t) => {
    const cfg = getStatusConfig(t.status_id, t.status_key)
    acc[cfg.key] = (acc[cfg.key] || 0) + 1
    return acc
  }, {})
  const slaLate = tickets.filter(t => t.is_sla_late || t.is_overdue_resolve).length
  const peta = tickets.filter(t => (t.instance || '').toUpperCase() === 'PETA')
  const gmx  = tickets.filter(t => (t.instance || '').toUpperCase() === 'GMX')

  const slaRows = tickets
    .filter(t => t.is_sla_late || t.is_overdue_resolve)
    .slice(0, 15)
    .map(t => ({ ...t, daysOverdue: calcDaysOverdue(t.due_date) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)

  // By technician (top 20)
  const techMap = {}
  for (const t of tickets) {
    const tech = t.technician || '—'
    if (!techMap[tech]) techMap[tech] = { total: 0, processing: 0, pending: 0, solved: 0, closed: 0, peta: 0, gmx: 0 }
    techMap[tech].total++
    const sk = getStatusConfig(t.status_id, t.status_key).key
    if (techMap[tech][sk] !== undefined) techMap[tech][sk]++
    if ((t.instance || '').toUpperCase() === 'PETA') techMap[tech].peta++
    else techMap[tech].gmx++
  }
  const techRows = Object.entries(techMap)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 20)

  // By entity (top 12)
  const entityMap = {}
  for (const t of tickets) {
    const e = processEntity(t.entity) || '—'
    if (!entityMap[e]) entityMap[e] = { total: 0, peta: 0, gmx: 0 }
    entityMap[e].total++
    if ((t.instance || '').toUpperCase() === 'PETA') entityMap[e].peta++
    else entityMap[e].gmx++
  }
  const entityRows = Object.entries(entityMap).sort((a, b) => b[1].total - a[1].total).slice(0, 12)

  // By group (top 15)
  const groupMap = {}
  for (const t of tickets) {
    const g = lastGroupLabel(t.group_name)
    if (!groupMap[g]) groupMap[g] = 0
    groupMap[g]++
  }
  const groupRows = Object.entries(groupMap).sort((a, b) => b[1] - a[1]).slice(0, 15)
  const maxGroup = groupRows[0]?.[1] || 1

  // Chart data
  const chartStatusLabels = ['Novo', 'Em atendimento', 'Pendente', 'Aprovação', 'Solucionado', 'Fechado']
  const chartStatusData = [
    byStatusKey.new || 0,
    byStatusKey.processing || 0,
    byStatusKey.pending || 0,
    byStatusKey.approval || 0,
    byStatusKey.solved || 0,
    byStatusKey.closed || 0,
  ]
  const chartStatusColors = ['#3b82f6', '#22c55e', '#f97316', '#f97316', '#6b7280', '#1f2937']
  const trend = build30DayTrend(tickets)
  const lineDatasets = [
    {
      label: 'Abertos',
      data: trend.opened,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 2,
    },
    {
      label: 'Fechados',
      data: trend.closed,
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34,197,94,0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 2,
    },
  ]

  const thTd = { padding: '8px 12px', fontSize: '0.82rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const thStyle = { ...thTd, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', background: 'var(--background)' }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Page title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
            Visão geral dos tickets GLPI — Peta e GMX
          </p>
        </div>
        {lastSync && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Última sincronização: {fmt(lastSync)}
          </span>
        )}
      </div>

      {/* Main stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px' }}>
        <StatCard label="Total" value={total} color="var(--text-primary)" />
        <StatCard label="Em Atendimento" value={byStatusKey.processing || 0} color="#16a34a" href="/tickets?status=processing" />
        <StatCard label="Pendentes"       value={byStatusKey.pending || 0}    color="#ea580c" href="/tickets/espera" />
        <StatCard label="Aprovação"       value={byStatusKey.approval || 0}   color="#ea580c" href="/aprovacao" />
        <StatCard label="SLA Excedido"    value={slaLate}                    color="#dc2626" href="/tickets?sla=late" />
      </div>

      {/* Instance breakdown */}
      {[
        { label: 'Peta', list: peta, color: '#2563eb' },
        { label: 'GMX',  list: gmx,  color: '#ea580c' },
      ].map(({ label, list, color }) => {
        const byS = list.reduce((a, t) => {
          const k = getStatusConfig(t.status_id, t.status_key).key
          a[k] = (a[k] || 0) + 1; return a
        }, {})
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
                { k: 'approval', l: 'Aprovação', c: '#f97316' },
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

      {/* SLA table */}
      {slaRows.length > 0 && (
        <Card>
          <SectionTitle>Tickets com SLA Excedido (top {slaRows.length})</SectionTitle>
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
                {slaRows.map(t => (
                  <tr key={t.ticket_id} className="sla-late">
                    <td style={{ ...thTd, fontWeight: 700, color: 'var(--primary)' }}>#{t.ticket_id}</td>
                    <td style={{ ...thTd, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title || '—'}</td>
                    <td style={{ ...thTd, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{processEntity(t.entity)}</td>
                    <td style={thTd}>
                      <span className={`status-badge ${getStatusConfig(t.status_id, t.status_key).key}`}>
                        {getStatusConfig(t.status_id, t.status_key).label}
                      </span>
                    </td>
                    <td style={thTd}>{t.technician || '—'}</td>
                    <td style={{ ...thTd, color: '#dc2626', fontWeight: 700 }}>
                      {t.daysOverdue > 0 ? `${t.daysOverdue}d` : '< 1d'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* By Technician */}
      {techRows.length > 0 && (
        <Card>
          <SectionTitle>Tickets por Técnico (top {techRows.length})</SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  {['Técnico', 'Total', 'Em Atendimento', 'Pendente', 'Solucionado', 'Fechado', 'PETA', 'GMX'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {techRows.map(([name, s], i) => (
                  <tr key={name} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                    <td style={{ ...thTd, fontWeight: 600 }}>{name}</td>
                    <td style={{ ...thTd, fontWeight: 700 }}>{s.total}</td>
                    <td style={{ ...thTd, color: '#16a34a' }}>{s.processing}</td>
                    <td style={{ ...thTd, color: '#ea580c' }}>{s.pending}</td>
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

      {/* By Group — progress bars */}
      {groupRows.length > 0 && (
        <Card>
          <SectionTitle>Tickets por Grupo (top {groupRows.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {groupRows.map(([name, count]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '180px', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--text-secondary)' }}>{name}</div>
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
            { href: '/tickets',        label: 'Tickets Ativos' },
            { href: '/tickets/espera', label: 'Tickets em Espera' },
            { href: '/aprovacao',      label: 'Fila de Aprovação' },
            { href: '/kanban',         label: 'Kanban' },
            { href: '/relatorios',     label: 'Relatórios' },
          ].map(l => (
            <Link key={l.href} href={l.href} style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--background)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}>
              {l.label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}
