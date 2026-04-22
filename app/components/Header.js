'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useFilters } from '../context/FilterContext'

const NAV = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: '/tickets',
    label: 'Monitor.Tickets',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    href: '/incidentes',
    label: 'Incidentes',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    href: '/relatorios',
    label: 'Relatórios',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    href: '/kanban',
    label: 'Kanban',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    ),
  },
]

const selStyle = {
  padding: '5px 8px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--text-primary)',
  fontSize: '0.8rem',
  cursor: 'pointer',
}

export default function Header() {
  const pathname = usePathname()
  const [dark, setDark] = useState(false)
  const { globalSearch, setGlobalSearch, period, setPeriod, globalTechnician, setGlobalTechnician, availableTechnicians } = useFilters()

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') {
      setDark(true)
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    if (next) document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
  }

  return (
    <header style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '10px 20px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{
        maxWidth: '1800px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexShrink: 0, marginRight: '4px' }}>
          <img
            src="/favicon-peta.png"
            alt="Logo"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
            }}
          />
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>Central de Tickets</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>GLPI Dashboard</div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {NAV.map(item => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 11px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 500,
                textDecoration: 'none',
                background: active ? 'var(--primary)' : 'var(--background)',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}>
                {item.icon}
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Global filters (right-aligned) */}
        <div style={{ display: 'flex', gap: '7px', alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>

          {/* Search */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
              fill="none" stroke="var(--text-muted)" strokeWidth="2.5"
              style={{ position: 'absolute', left: '7px', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Buscar ID do ticket..."
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              style={{
                ...selStyle,
                paddingLeft: '24px',
                width: '190px',
              }}
            />
          </div>

          {/* Period */}
          <select value={period} onChange={e => setPeriod(e.target.value)} style={selStyle}>
            <option value="all">Todos os períodos</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>

          {/* Technician — only visible when there are technicians registered by the current page */}
          {availableTechnicians.length > 0 && (
            <select value={globalTechnician} onChange={e => setGlobalTechnician(e.target.value)}
              style={{ ...selStyle, maxWidth: '160px' }}>
              <option value="">Todos os técnicos</option>
              {availableTechnicians.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          {/* Theme toggle */}
          <button onClick={toggle} title="Alternar tema" style={{
            ...selStyle,
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-primary)',
            flexShrink: 0,
          }}>
            {dark ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
