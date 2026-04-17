'use client'
import { useEffect, useState, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useFilters } from '../context/FilterContext'
import { processEntity, lastGroupLabel, fmt } from '../lib/utils'
import InstanceBadge from '../components/InstanceBadge'

const sel = {
  padding: '7px 10px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--background)',
  color: 'var(--text-primary)', fontSize: '0.82rem',
}

export default function AprovacaoPage() {
  const { applyFilters, setAvailableTechnicians } = useFilters()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [fEntity, setFEntity] = useState('')
  const [fGroup, setFGroup] = useState('')
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await getSupabaseClient()
        .from('tickets_cache')
        .select('ticket_id,title,entity,group_name,technician,date_created,date_mod,instance')
        .eq('status_id', 7)
        .order('date_mod', { ascending: false })
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

  async function handleAction(ticketId, newStatusId, newStatusKey, label) {
    try {
      const { error: err } = await getSupabaseClient()
        .from('tickets_cache')
        .update({ status_id: newStatusId, status_key: newStatusKey })
        .eq('ticket_id', ticketId)
      if (err) throw err
      setToast({ ok: true, msg: `Ticket #${ticketId} ${label} com sucesso.` })
      setTimeout(() => setToast(null), 3000)
      load()
    } catch (e) {
      setToast({ ok: false, msg: `Erro: ${e.message}` })
    }
  }

  const entities = [...new Set(tickets.map(t => processEntity(t.entity)).filter(v => v !== '—'))].sort()
  const groups   = [...new Set(tickets.map(t => lastGroupLabel(t.group_name)).filter(v => v !== '—'))].sort()

  const filtered = applyFilters(tickets).filter(t => {
    if (fEntity && processEntity(t.entity) !== fEntity) return false
    if (fGroup  && lastGroupLabel(t.group_name) !== fGroup) return false
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Aprovação</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Tickets aguardando validação</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {lastUpdate && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}</span>}
          <button onClick={load} style={{ ...sel, cursor: 'pointer', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600 }}>Atualizar</button>
        </div>
      </div>

      {toast && (
        <div style={{
          padding: '11px 16px', borderRadius: 'var(--radius-md)', fontWeight: 500, fontSize: '0.875rem',
          background: toast.ok ? '#dcfce7' : '#fee2e2',
          color: toast.ok ? '#16a34a' : '#dc2626',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Count */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          padding: '5px 12px', borderRadius: 'var(--radius-md)',
          background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.82rem',
        }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ea580c' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Em aprovação:</span>
          <span style={{ fontWeight: 700, color: '#ea580c' }}>{filtered.length}</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <select value={fEntity} onChange={e => setFEntity(e.target.value)} style={{ ...sel, maxWidth: '200px' }}>
          <option value="">Todas as entidades</option>
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={fGroup} onChange={e => setFGroup(e.target.value)} style={{ ...sel, maxWidth: '200px' }}>
          <option value="">Todos os grupos</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <button onClick={() => { setFEntity(''); setFGroup('') }} style={{ ...sel, cursor: 'pointer' }}>Limpar</button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}><div className="spinner" /></div>
      ) : error ? (
        <div style={{ color: '#dc2626', padding: '16px' }}>Erro: {error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>Nenhum ticket aguardando aprovação.</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                {['ID', 'Título', 'Entidade', 'Grupo', 'Técnico', 'Abertura', 'Últ. Atualização', 'Instância', 'Ações'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={`${t.ticket_id}-${t.instance}`}
                  style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>#{t.ticket_id}</td>
                  <td className="col-entity" style={{ padding: '9px 12px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || '—'}</td>
                  <td className="col-entity" style={{ padding: '9px 12px' }}>{processEntity(t.entity)}</td>
                  <td className="col-group" style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{lastGroupLabel(t.group_name)}</td>
                  <td className="col-technician" style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{t.technician || '—'}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_created)}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_mod)}</td>
                  <td style={{ padding: '9px 12px' }}><InstanceBadge instance={t.instance} /></td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => handleAction(t.ticket_id, 2, 'processing', 'aprovado')}
                      style={{ padding: '4px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', background: '#dcfce7', color: '#16a34a', fontWeight: 600, fontSize: '0.78rem', marginRight: '5px' }}>
                      Aprovar
                    </button>
                    <button onClick={() => handleAction(t.ticket_id, 4, 'pending', 'rejeitado')}
                      style={{ padding: '4px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', background: '#fee2e2', color: '#dc2626', fontWeight: 600, fontSize: '0.78rem' }}>
                      Rejeitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
