'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { DoughnutChart, LineChart, BarChart } from './components/Charts'
import { fmt, formatWaitTime } from './lib/utils'

// ── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#f97316', '#dc2626', '#7f1d1d']

const STATUS_LABEL_KEY = {
  'Novo': 'new', 'Em Atendimento': 'processing', 'Pendente': 'pending',
  'Aprovação': 'approval', 'Solucionado': 'solved', 'Fechado': 'closed',
}

const INSTANCE_OPTIONS = [
  { value: 'PETA,GMX', label: 'PETA + GMX' },
  { value: 'PETA',     label: 'PETA' },
  { value: 'GMX',      label: 'GMX' },
]

const REFRESH_INTERVAL = 10 * 60 * 1000

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

function KpiDivider() {
  return <div style={{ width: '1px', background: 'var(--border)', alignSelf: 'stretch', margin: '0 4px' }} />
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [analytics, setAnalytics]   = useState(null)
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [instance, setInstance]     = useState('PETA,GMX')
  const [nextRefresh, setNextRefresh] = useState(Date.now() + REFRESH_INTERVAL)
  const loadSeq = useRef(0)

  const load = useCallback(async (inst) => {
    const seq = ++loadSeq.current
    setFetchError(null)
    try {
      const res = await fetch(`/api/py/analytics?instance=${inst}`)
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
    load(instance)
    const iv = setInterval(() => load(instance), REFRESH_INTERVAL)
    return () => clearInterval(iv)
  }, [load, instance])

  // ── Derived values ────────────────────────────────────────────────
  const a            = analytics
  const dataTruncated = a?.data_truncated ?? false
  const kpis         = a?.kpis       ?? {}
  const byStatusKey  = Object.fromEntries((a?.by_status ?? []).map(s => [s.key, s.count]))
  const slaCritico   = a?.sla_critical ?? []
  const rate7        = a?.resolution_rate_7d  ?? { rate: 0, resolved: 0, total: 0 }
  const rate30       = a?.resolution_rate_30d ?? { rate: 0, resolved: 0, total: 0 }
  const trend        = a?.trend_30d  ?? { labels: [], opened: [], closed: [] }

  const catRows      = (a?.by_category    ?? []).map(r => [r.name, r.count])
  const techRows     = (a?.by_technician  ?? []).map(r => [r.name, r.count])
  const entityRows   = (a?.by_entity      ?? []).map(r => [r.name, { total: r.count }])
  const groupRows    = (a?.by_group       ?? []).map(r => [r.name, r.count])
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

  const thTd    = { padding: '8px 12px', fontSize: '0.82rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const thStyle = { ...thTd, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', background: 'var(--background)' }

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
      <div className="spinner" />
    </div>
  )

  if (fetchError && !analytics) return (
    <div style={{ padding: '24px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      <span><strong>Erro ao carregar:</strong> {fetchError}</span>
      <button onClick={() => load(instance)} style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
        Tentar novamente
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Error inline banner */}
      {fetchError && analytics && (
        <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <span><strong>Erro ao atualizar:</strong> {fetchError}</span>
          <button onClick={() => load(instance)} style={{ padding: '4px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}>
            Tentar novamente
          </button>
        </div>
      )}

      {dataTruncated && (
        <div style={{ padding: '10px 16px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, color: '#c2410c', fontSize: '0.82rem' }}>
          ⚠️ Os dados foram truncados no servidor — totais podem estar subestimados.
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Central de Tickets</h1>
          <div style={{ display: 'flex', gap: '16px', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            {a?.generated_at && (
              <span className="text-muted-sm">Gerado às {new Date(a.generated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            )}
            {a?.last_sync && <span className="text-muted-sm">Sincronizado: {fmt(a.last_sync)}</span>}
            <RefreshCountdown nextAt={nextRefresh} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Instance selector */}
          <div style={{ display: 'flex', background: 'var(--border)', borderRadius: '8px', padding: '2px', gap: '2px' }}>
            {INSTANCE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setInstance(opt.value)}
                style={{
                  padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s',
                  background: instance === opt.value ? 'var(--surface)' : 'transparent',
                  color: instance === opt.value ? 'var(--primary)' : 'var(--text-secondary)',
                  boxShadow: instance === opt.value ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={() => load(instance)} className="btn-primary">
            <RefreshIcon /> Atualizar
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: '12px' }}>
        <StatCard label="Total"          value={kpis.total}      color="var(--text-primary)" />
        <StatCard label="Incidentes"     value={kpis.incidents}  color="#dc2626" href="/incidentes" highlight />
        <StatCard label="Requisições"    value={kpis.requests}   color="#3b82f6" href="/tickets" highlight />
        <StatCard label="Em Atendimento" value={kpis.processing} color="#16a34a" href="/tickets?status=processing" highlight />
        <StatCard label="Pendentes"      value={kpis.pending}    color="#ea580c" href="/tickets?status=pending" highlight />
        <StatCard label="Aprovação"      value={kpis.approval}   color="#7c3aed" href="/tickets?status=approval,pending-approval" highlight />
        <StatCard
          label="SLA Excedido"
          value={kpis.sla_late}
          color="#dc2626"
          href="/tickets?sla=late"
          sub={`${kpis.sla_late_active ?? 0} não resolvidos`}
          highlight
        />
        {slaCompliance !== null && (
          <StatCard
            label="Conformidade SLA"
            value={`${slaCompliance}%`}
            color={Number(slaCompliance) >= 90 ? '#16a34a' : Number(slaCompliance) >= 75 ? '#ea580c' : '#dc2626'}
            highlight
          />
        )}
        {kpis.avg_resolution && kpis.avg_resolution !== '—' && (
          <StatCard label="TMR" value={kpis.avg_resolution} color="#6b7280" sub="Tempo médio resolução" />
        )}
      </div>

      {/* Instance breakdown */}
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
                    { k: 'new',        l: 'Novos',         c: '#3b82f6' },
                    { k: 'processing', l: 'Atendimento',   c: '#22c55e' },
                    { k: 'pending',    l: 'Pendentes',     c: '#f97316' },
                    { k: 'approval',   l: 'Aprovação',     c: '#7c3aed' },
                    { k: 'solved',     l: 'Solucionados',  c: '#6b7280' },
                    { k: 'closed',     l: 'Fechados',      c: '#374151' },
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

      {/* Charts — Status donut + 30d trend */}
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

      {/* Resolution rates + Pending + Canal */}
      <div style={{ display: 'grid', gridTemplateColumns: reqTypeRows.length > 1 ? '2fr 1fr' : '1fr', gap: '14px' }}>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <StatCard label="Resolução (7d)"   value={`${rate7.rate}%`}  color="#16a34a" sub={`${rate7.resolved}/${rate7.total}`} />
            <StatCard label="Resolução (30d)"  value={`${rate30.rate}%`} color="#16a34a" sub={`${rate30.resolved}/${rate30.total}`} />
            <StatCard label="Tempo em Pendência" value={formatWaitTime(kpis.avg_pending_hours ?? 0)} color="#ea580c" sub={`${kpis.pending ?? 0} tickets`} />
          </div>
        </Card>
        {reqTypeRows.length > 1 && (
          <Card>
            <SectionTitle>Canal de Requisição</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {reqTypeRows.map(([name, count]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '110px', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--text-secondary)' }}>{name}</div>
                  <ProgressBar value={count} max={maxReqType} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '28px', textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* SLA crítico */}
      {slaCritico.length > 0 && (
        <Card>
          <SectionTitle
            action={<Link href="/tickets?sla=late&status=new,processing,pending,approval,pending-approval" style={{ fontSize: '0.78rem', color: 'var(--primary)' }}>Ver todos →</Link>}
          >
            SLA Crítico — {kpis.sla_late_active ?? slaCritico.length} não resolvidos
          </SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  {['ID', 'Instância', 'Título', 'Entidade', 'Status', 'Prioridade', 'Atraso'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slaCritico.map((t, i) => {
                  const statusKey = STATUS_LABEL_KEY[t.status_label] ?? 'unknown'
                  return (
                    <tr key={`${t.ticket_id}-${t.instance}`} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                      <td style={{ ...thTd, fontWeight: 700, color: 'var(--primary)' }}>
                        <Link href={`/tickets?search=${t.ticket_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>#{t.ticket_id}</Link>
                      </td>
                      <td style={thTd}>
                        <span className={`instance-badge ${(t.instance || '').toLowerCase()}`}>{t.instance}</span>
                      </td>
                      <td style={{ ...thTd, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.title}>{t.title || '—'}</td>
                      <td style={{ ...thTd, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.entity_clean}>{t.entity_clean || '—'}</td>
                      <td style={thTd}>
                        <span className={`status-badge ${statusKey}`}>{t.status_label || '—'}</span>
                      </td>
                      <td style={thTd}>{t.priority_label || '—'}</td>
                      <td style={{ ...thTd, color: '#dc2626', fontWeight: 700 }}>
                        {(t.days_overdue ?? 0) > 0 ? `${t.days_overdue}d` : '< 1d'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tickets em Aprovação */}
      {(kpis.approval ?? 0) > 0 && (
        <Card>
          <SectionTitle
            action={kpis.approval > 5
              ? <Link href="/tickets?status=approval,pending-approval" style={{ fontSize: '0.78rem', color: 'var(--primary)' }}>Ver todos {kpis.approval} →</Link>
              : null}
          >
            Tickets em Aprovação — {kpis.approval}
          </SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {(a?.approval_tickets ?? []).map(t => (
              <div key={`${t.ticket_id}-${t.instance}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className={`instance-badge ${(t.instance || '').toLowerCase()}`} style={{ flexShrink: 0 }}>{t.instance}</span>
                <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.82rem', flexShrink: 0 }}>#{t.ticket_id}</span>
                <span style={{ fontSize: '0.82rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || '—'}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{t.entity_clean || '—'}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Categoria Raiz + Prioridade */}
      <div style={{ display: 'grid', gridTemplateColumns: prioData.length > 0 ? '2fr 1fr' : '1fr', gap: '14px' }}>
        {catRows.length > 0 && (
          <Card>
            <SectionTitle>Tickets por Categoria</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {catRows.map(([name, count]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '160px', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--text-secondary)' }}>{name}</div>
                  <ProgressBar value={count} max={maxCat} color="linear-gradient(90deg, var(--primary), var(--primary-dark))" />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '32px', textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
        {prioData.length > 0 && (
          <Card>
            <SectionTitle>Por Prioridade</SectionTitle>
            <BarChart labels={prioLabels} data={prioData} colors={prioColors} height={220} horizontal={false} />
          </Card>
        )}
      </div>

      {/* Técnicos + Grupos — side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: groupRows.length > 0 ? '1fr 1fr' : '1fr', gap: '14px' }}>
        {techRows.length > 0 && (
          <Card>
            <SectionTitle>Por Técnico</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {techRows.map(([name, count], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: '16px', textAlign: 'right', flexShrink: 0, fontWeight: 600 }}>{i + 1}</span>
                  <div style={{ width: '140px', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {name === '—' ? <em style={{ color: 'var(--text-muted)' }}>Sem técnico</em> : name}
                  </div>
                  <ProgressBar value={count} max={maxTech} color="linear-gradient(90deg, var(--primary), var(--primary-dark))" />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, width: '28px', textAlign: 'right', color: 'var(--primary)', flexShrink: 0 }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
        {groupRows.length > 0 && (
          <Card>
            <SectionTitle>Por Grupo</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {groupRows.map(([name, count]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '160px', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--text-secondary)' }}>
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

      {/* Entidades */}
      {entityRows.length > 0 && (
        <div>
          <SectionTitle>Tickets por Entidade</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
            {entityRows.slice(0, 16).map(([name, s]) => (
              <Link
                key={name}
                href={`/tickets?entity=${encodeURIComponent(name)}`}
                className="btn-link"
                style={{ textDecoration: 'none' }}
              >
                <div className="stat-card" style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{name}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.total}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
