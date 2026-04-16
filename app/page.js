import { getSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getStats() {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('tickets_cache')
      .select('status_id, status_key, is_sla_late, instance')

    if (error || !data) return null

    let total = data.length
    let processing = 0, pending = 0, approval = 0, slaLate = 0, peta = 0, gmx = 0, newT = 0

    for (const t of data) {
      const sid = Number(t.status_id)
      const sk = t.status_key
      if (sid === 1 || sk === 'new') newT++
      else if (sid === 2 || sk === 'processing') processing++
      else if (sid === 4 || sk === 'pending') pending++
      else if (sid === 7) approval++
      if (t.is_sla_late) slaLate++
      const inst = (t.instance || '').toLowerCase()
      if (inst === 'peta') peta++
      else if (inst === 'gmx') gmx++
    }

    return { total, newT, processing, pending, approval, slaLate, peta, gmx }
  } catch {
    return null
  }
}

function StatCard({ label, value, color, href }) {
  const card = (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      boxShadow: 'var(--shadow-sm)',
      cursor: href ? 'pointer' : 'default',
      transition: 'box-shadow 0.2s',
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color }}>
        {value ?? '—'}
      </div>
    </div>
  )
  if (href) return <Link href={href} style={{ textDecoration: 'none' }}>{card}</Link>
  return card
}

export default async function DashboardPage() {
  const stats = await getStats()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '0.9rem' }}>
          Visão geral dos tickets GLPI — Peta e GMX
        </p>
      </div>

      {!stats ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}>
          Supabase não configurado. Defina as variáveis de ambiente <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </div>
      ) : (
        <>
          {/* Main stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
            <StatCard label="Total de Tickets" value={stats.total} color="var(--text-primary)" />
            <StatCard label="Em Atendimento" value={stats.processing} color="var(--status-processing)" href="/tickets?status=2" />
            <StatCard label="Pendentes" value={stats.pending} color="var(--status-pending)" href="/tickets/espera" />
            <StatCard label="Aprovação" value={stats.approval} color="var(--status-approval)" href="/aprovacao" />
            <StatCard label="SLA Excedido" value={stats.slaLate} color="var(--sla-late)" href="/tickets?sla=late" />
          </div>

          {/* Instance breakdown */}
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Por Instância (tickets ativos)
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
              <StatCard label="Peta" value={stats.peta} color="#2563eb" href="/tickets?instance=peta" />
              <StatCard label="GMX" value={stats.gmx} color="#9333ea" href="/tickets?instance=gmx" />
            </div>
          </div>

          {/* Quick links */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Acessos Rápidos
            </h2>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { href: '/tickets', label: 'Ver Tickets Ativos' },
                { href: '/tickets/espera', label: 'Tickets em Espera' },
                { href: '/aprovacao', label: 'Fila de Aprovação' },
                { href: '/kanban', label: 'Visualização Kanban' },
                { href: '/relatorios', label: 'Relatórios' },
              ].map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    transition: 'all 0.15s',
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
