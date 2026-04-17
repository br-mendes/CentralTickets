'use client'
import { useEffect, useState, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useFilters } from '../../context/FilterContext'
import { processEntity, lastGroupLabel, fmt, calcHoursAgo, formatWaitTime } from '../../lib/utils'
import InstanceBadge from '../../components/InstanceBadge'
import StatusBadge from '../../components/StatusBadge'

const sel = {
  padding: '7px 10px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--background)',
  color: 'var(--text-primary)', fontSize: '0.82rem',
}

export default function EmEsperaPage() {
  const { applyFilters, setAvailableTechnicians } = useFilters()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [fInstance, setFInstance] = useState('')
  const [fWait, setFWait] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await getSupabaseClient()
        .from('tickets_cache')
        .select('ticket_id,title,entity,status_id,status_key,status_name,group_name,technician,date_created,date_mod,instance')
        .in('status_key', ['processing', 'pending'])   /* Em espera inclui ambos */
        .order('date_mod', { ascending: true })         /* Mais antigos primeiro */
      if (err) throw err
      setTickets(data || [])
      setLastUpdate(new Date())
      const techs = [...new Set((data || []).map(t => t.technician).filter(Boolean))].sort()
      setAvailableTechnicians(techs)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [setAvailableTechnicians])

  useEffect(() => {
    load()
    const iv = setInterval(load, 3 * 60 * 1000)
    return () => clearInterval(iv)
  }, [load])

  const filtered = applyFilters(tickets).filter(t => {
    if (fInstance && (t.instance || '').toUpperCase() !== fInstance.toUpperCase()) return false
    if (search) {
      const s = search.toLowerCase()
      if (!String(t.ticket_id).includes(s) && !(t.title || '').toLowerCase().includes(s) && !processEntity(t.entity).toLowerCase().includes(s)) return false
    }
    if (fWait) {
      const h = calcHoursAgo(t.date_mod)
      if (fWait === '72' && h < 72) return false
      if (fWait === '24' && h < 24) return false
    }
    return true
  })

  const over24 = filtered.filter(t => calcHoursAgo(t.date_mod) >= 24).length
  const over72 = filtered.filter(t => calcHoursAgo(t.date_mod) >= 72).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Tickets em Espera</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Monitoramento de última interação</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {lastUpdate && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}</span>}
          <button onClick={load} style={{ ...sel, cursor: 'pointer', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600 }}>Atualizar</button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total em espera', v: filtered.length, color: '#3b82f6' },
          { label: '+ de 24h', v: over24, color: '#f97316' },
          { label: '+ de 72h (crítico)', v: over72, color: '#dc2626' },
        ].map(s => (
          <div key={s.label} style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            padding: '5px 12px', borderRadius: 'var(--radius-md)',
            background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.82rem',
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{s.label}:</span>
            <span style={{ fontWeight: 700, color: s.color }}>{s.v}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input placeholder="Buscar ID, título, entidade..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...sel, minWidth: '200px', flex: 1 }} />
        <select value={fInstance} onChange={e => setFInstance(e.target.value)} style={sel}>
          <option value="">Todas as instâncias</option>
          <option value="PETA">Peta</option>
          <option value="GMX">GMX</option>
        </select>
        <select value={fWait} onChange={e => setFWait(e.target.value)} style={sel}>
          <option value="">Qualquer tempo</option>
          <option value="24">+ de 24h</option>
          <option value="72">+ de 72h</option>
        </select>
        <button onClick={() => { setSearch(''); setFInstance(''); setFWait('') }} style={{ ...sel, cursor: 'pointer' }}>Limpar</button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}><div className="spinner" /></div>
      ) : error ? (
        <div style={{ color: '#dc2626', padding: '16px' }}>Erro: {error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>Nenhum ticket em espera.</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                {['ID', 'Instância', 'Entidade', 'Status', 'Grupo Responsável', 'Técnico', 'Abertura', 'Últ. Atualização', 'Tempo Espera'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => {
                const hours = calcHoursAgo(t.date_mod)
                const rowClass = hours >= 72 ? 'alert-red' : hours >= 24 ? 'alert-yellow' : ''
                const timeColor = hours >= 72 ? '#dc2626' : hours >= 24 ? '#ea580c' : 'var(--text-secondary)'
                const timeSuffix = hours >= 72 ? ' (crítico)' : hours >= 24 ? ' (atrasado)' : ''
                return (
                  <tr key={`${t.ticket_id}-${t.instance}`} className={rowClass}
                    style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>#{t.ticket_id}</span>
                      {t.title && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>}
                    </td>
                    <td style={{ padding: '9px 12px' }}><InstanceBadge instance={t.instance} /></td>
                    <td className="col-entity" style={{ padding: '9px 12px' }}>{processEntity(t.entity)}</td>
                    <td style={{ padding: '9px 12px' }}><StatusBadge statusId={t.status_id} statusKey={t.status_key} statusName={t.status_name} /></td>
                    <td className="col-group" style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{lastGroupLabel(t.group_name)}</td>
                    <td className="col-technician" style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{t.technician || '—'}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_created)}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_mod)}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontWeight: 700, color: timeColor }}>
                      {formatWaitTime(hours)}{timeSuffix}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
