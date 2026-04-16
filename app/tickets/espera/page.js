'use client'
import { useEffect, useState, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import InstanceBadge from '../../components/InstanceBadge'
import StatusBadge from '../../components/StatusBadge'

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function waitTime(dateStr) {
  if (!dateStr) return { label: '—', hours: 0 }
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(hours / 24)
  if (days > 0) return { label: `${days}d ${hours % 24}h`, hours }
  return { label: `${hours}h`, hours }
}

export default function EmEsperaPage() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filterInstance, setFilterInstance] = useState('')
  const [filterWait, setFilterWait] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error: err } = await supabase
        .from('tickets_cache')
        .select('ticket_id,title,entity,status_id,status_key,status_name,date_created,date_mod,group_name,technician,instance')
        .in('status_id', [4])
        .order('date_mod', { ascending: true })

      if (err) throw err
      setTickets(data || [])
      setLastUpdate(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 3 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  const filtered = tickets.filter(t => {
    if (filterInstance && (t.instance || '').toLowerCase() !== filterInstance.toLowerCase()) return false
    if (filterWait) {
      const { hours } = waitTime(t.date_mod)
      if (filterWait === '72' && hours < 72) return false
      if (filterWait === '24' && hours < 24) return false
    }
    if (search) {
      const s = search.toLowerCase()
      if (!String(t.ticket_id).includes(s) && !(t.title || '').toLowerCase().includes(s) && !(t.entity || '').toLowerCase().includes(s)) return false
    }
    return true
  })

  const over24 = filtered.filter(t => waitTime(t.date_mod).hours >= 24).length
  const over72 = filtered.filter(t => waitTime(t.date_mod).hours >= 72).length

  const inputStyle = {
    padding: '7px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--background)',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>Tickets em Espera</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Monitoramento de última interação</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {lastUpdate && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}</span>}
          <button onClick={load} style={{ ...inputStyle, cursor: 'pointer', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 600 }}>
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total em espera', value: filtered.length, color: '#3b82f6' },
          { label: '+ de 24h', value: over24, color: '#f97316' },
          { label: '+ de 72h', value: over72, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 14px', borderRadius: 'var(--radius-md)',
            background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.85rem',
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{s.label}:</span>
            <span style={{ fontWeight: 700, color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '16px',
        display: 'flex', gap: '10px', flexWrap: 'wrap',
      }}>
        <input placeholder="Buscar ID, título ou entidade..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, minWidth: '220px', flex: 1 }} />
        <select value={filterInstance} onChange={e => setFilterInstance(e.target.value)} style={inputStyle}>
          <option value="">Todas as instâncias</option>
          <option value="peta">Peta</option>
          <option value="gmx">GMX</option>
        </select>
        <select value={filterWait} onChange={e => setFilterWait(e.target.value)} style={inputStyle}>
          <option value="">Qualquer tempo</option>
          <option value="24">Mais de 24h</option>
          <option value="72">Mais de 72h</option>
        </select>
        <button onClick={() => { setSearch(''); setFilterInstance(''); setFilterWait('') }}
          style={{ ...inputStyle, cursor: 'pointer' }}>
          Limpar
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Carregando...</div>
      ) : error ? (
        <div style={{ color: 'var(--sla-late)', padding: '16px' }}>Erro: {error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>Nenhum ticket em espera.</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                {['ID', 'Instância', 'Entidade', 'Status', 'Grupo', 'Técnico', 'Abertura', 'Últ. Atualização', 'Tempo Espera'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => {
                const { label, hours } = waitTime(t.date_mod)
                const rowClass = hours >= 72 ? 'row-wait-critical' : hours >= 24 ? 'row-wait-warning' : ''
                return (
                  <tr key={t.ticket_id} className={rowClass}
                    style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--primary)' }}>#{t.ticket_id}</span>
                      {t.title && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>}
                    </td>
                    <td style={{ padding: '10px 14px' }}><InstanceBadge instance={t.instance} /></td>
                    <td style={{ padding: '10px 14px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.entity || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge statusId={t.status_id} statusKey={t.status_key} statusName={t.status_name} /></td>
                    <td style={{ padding: '10px 14px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{t.group_name || '—'}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{t.technician || '—'}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_created)}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_mod)}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontWeight: 700,
                        color: hours >= 72 ? 'var(--sla-late)' : hours >= 24 ? '#f97316' : 'var(--text-secondary)',
                      }}>
                        {label}
                      </span>
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
