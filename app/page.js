'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DoughnutChart, LineChart, BarChart } from './components/Charts'
import { fmt, formatWaitTime } from './lib/utils'

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
  return <div className="card" style={style}>{children}</div>
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [fetchError, setFetchError] = useState(null)

  const load = useCallback(async () => {
    setFetchError(null)
    try {
      const res = await fetch('/api/py/analytics?instance=PETA,GMX')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `HTTP ${res.status}`)
      }
      setAnalytics(await res.json())
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

  // ── Derived values from analytics response ────────────────────────
  const a = analytics
  const kpis        = a?.kpis       ?? {}
  const byStatusKey = Object.fromEntries((a?.by_status ?? []).map(s => [s.key, s.count]))
  const slaCritico  = a?.sla_critical ?? []
  const rate7       = a?.resolution_rate_7d  ?? { rate: 0, resolved: 0, total: 0 }
  const rate30      = a?.resolution_rate_30d ?? { rate: 0, resolved: 0, total: 0 }
  const trend       = a?.trend_30d  ?? { labels: [], opened: [], closed: [] }

  const catRows     = (a?.by_category    ?? []).map(r => [r.name, r.count])
  const techRows    = (a?.by_technician  ?? []).map(r => [r.name, r.count])
  const entityRows  = (a?.by_entity      ?? []).map(r => [r.name, { total: r.count }])
  const groupRows   = (a?.by_group       ?? []).map(r => [r.name, r.count])
  const reqTypeRows = (a?.by_request_type ?? []).map(r => [r.name, r.count])

  const maxCat     = catRows[0]?.[1]     || 1
  const maxTech    = techRows[0]?.[1]    || 1
  const maxGroup   = groupRows[0]?.[1]   || 1
  const maxReqType = reqTypeRows[0]?.[1] || 1

  const prioLabels = (a?.by_priority ?? []).map(r => r.label)
  const prioData   = (a?.by_priority ?? []).map(r => r.count)
  const prioColors = (a?.by_priority ?? []).map(r => PRIORITY_COLORS[(r.priority_id ?? 3) - 1] || '#94a3b8')

  const lineDatasets = [
    { label: 'Abertos',  data: trend.opened, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3, pointRadius: 2 },
    { label: 'Fechados', data: trend.closed, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)',  fill: true, tension: 0.3, pointRadius: 2 },
  ]
  const chartStatusLabels = ['Novo', 'Em atendimento', 'Pendente', 'Aprovação', 'Solucionado', 'Fechado']
  const chartStatusData   = [byStatusKey.new||0, byStatusKey.processing||0, byStatusKey.pending||0, (byStatusKey.approval||0)+(byStatusKey['pending-approval']||0), byStatusKey.solved||0, byStatusKey.closed||0]
  const chartStatusColors = ['#3b82f6', '#22c55e', '#f97316', '#7c3aed', '#6b7280', '#1f2937']

  const thTd    = { padding: '8px 12px', fontSize: '0.82rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const thStyle = { ...thTd, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', background: 'var(--background)' }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
      <div className="spinner" />
    </div>
  )

  if (fetchError && !analytics) return (
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
          {a?.last_sync && <span className="text-muted-sm">Última sincronização: {fmt(a.last_sync)}</span>}
          <button onClick={load} className="btn-primary">
            <RefreshIcon /> Atualizar
          </button>
        </div>
      </div>

      {/* Main stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '14px' }}>
        <StatCard label="Total"           value={kpis.total}      color="var(--text-primary)" />
        <StatCard label="Incidentes"      value={kpis.incidents}  color="#dc2626" href="/incidentes" />
        <StatCard label="Requisições"     value={kpis.requests}   color="#3b82f6" href="/tickets" />
        <StatCard label="Em Atendimento"  value={kpis.processing} color="#16a34a" href="/tickets?status=processing" />
        <StatCard label="Pendentes"       value={kpis.pending}    color="#ea580c" href="/tickets?status=pending" />
        <StatCard label="Aprovação"       value={kpis.approval}   color="#7c3aed" href="/tickets?status=approval" />
        <StatCard label="SLA Excedido (Não resolvido)" value={kpis.sla_late_active} color="#dc2626" href="/tickets?sla=late" />
        <StatCard label="SLA Excedido"    value={kpis.sla_late}   color="#dc2626" href="/tickets?sla=late" />
        {kpis.avg_resolution && kpis.avg_resolution !== '—' && (
          <StatCard label="Tempo Médio Resolução" value={kpis.avg_resolution} color="#6b7280" />
        )}
      </div>

      {/* Instance breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {[{ key: 'PETA', label: 'Peta', color: '#2563eb' }, { key: 'GMX', label: 'GMX', color: '#ea580c' }].map(({ key, label, color }) => {
          const inst = a?.instance_breakdown?.[key] ?? {}
          return (
            <Card key={key} style={{ borderLeft: `4px solid ${color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color }}>{label}</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{inst.total ?? 0} tickets</span>
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
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: c }}>{inst[k] ?? 0}</div>
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

      {/* Taxa de Resolução + Tempo em Pendência + Canal de Requisição */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            <StatCard label="Taxa de Resolução (7d)"   value={`${rate7.rate}%`}  color="#16a34a" sub={`${rate7.resolved} / ${rate7.total} tickets`} />
            <StatCard label="Taxa de Resolução (30d)"  value={`${rate30.rate}%`} color="#16a34a" sub={`${rate30.resolved} / ${rate30.total} tickets`} />
            <StatCard label="Tempo Médio em Pendência" value={formatWaitTime(kpis.avg_pending_hours ?? 0)} color="#ea580c" sub={`${kpis.pending ?? 0} tickets pendentes`} />
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
                    <td style={{ ...thTd, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.entity_clean || '—'}</td>
                    <td style={thTd}>
                      <span className="status-badge">{t.status_label || '—'}</span>
                    </td>
                    <td style={thTd}>{t.requester_fullname || <em style={{ color: 'var(--text-muted)' }}>Sem solicitante</em>}</td>
                    <td style={thTd}>{t.technician     || <em style={{ color: 'var(--text-muted)' }}>Sem técnico</em>}</td>
                    <td style={{ ...thTd, color: '#dc2626', fontWeight: 700 }}>
                      {(t.days_overdue ?? 0) > 0 ? `${t.days_overdue}d atraso` : '< 1d'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tickets em Aprovação */}
      {(kpis.approval ?? 0) > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <SectionTitle>Tickets em Aprovação</SectionTitle>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: '#7c3aed', marginTop: '-10px' }}>{kpis.approval}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(a?.approval_tickets ?? []).map(t => (
              <div key={`${t.ticket_id}-${t.instance}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.82rem', flexShrink: 0 }}>#{t.ticket_id}</span>
                <span style={{ fontSize: '0.82rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || '—'}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{t.entity_clean || '—'}</span>
              </div>
            ))}
            {kpis.approval > 5 && (
              <Link href="/tickets?status=approval" style={{ fontSize: '0.78rem', color: 'var(--primary)', marginTop: '4px' }}>
                Ver todos os {kpis.approval} tickets em aprovação →
              </Link>
            )}
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
            <BarChart labels={prioLabels} data={prioData} colors={prioColors} height={220} horizontal={false} />
          </Card>
        )}
      </div>

      {/* Técnicos */}
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
