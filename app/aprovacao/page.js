'use client'
import { useEffect, useState, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import InstanceBadge from '../components/InstanceBadge'

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AprovacaoPage() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterEntity, setFilterEntity] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [actionMsg, setActionMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error: err } = await supabase
        .from('tickets_cache')
        .select('ticket_id,title,entity,group_name,technician,date_created,date_mod,instance')
        .eq('status_id', 7)
        .order('date_mod', { ascending: false })

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

  async function handleAction(ticketId, newStatusId, label) {
    try {
      const supabase = getSupabaseClient()
      const { error: err } = await supabase
        .from('tickets_cache')
        .update({ status_id: newStatusId })
        .eq('ticket_id', ticketId)

      if (err) throw err
      setActionMsg(`Ticket #${ticketId} ${label} com sucesso.`)
      setTimeout(() => setActionMsg(''), 3000)
      load()
    } catch (e) {
      setActionMsg(`Erro: ${e.message}`)
    }
  }

  const entities = [...new Set(tickets.map(t => t.entity).filter(Boolean))].sort()
  const groups = [...new Set(tickets.map(t => t.group_name).filter(Boolean))].sort()

  const filtered = tickets.filter(t => {
    if (filterEntity && t.entity !== filterEntity) return false
    if (filterGroup && t.group_name !== filterGroup) return false
    return true
  })

  const inputStyle = {
    padding: '7px 12px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)', background: 'var(--background)',
    color: 'var(--text-primary)', fontSize: '0.85rem',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>Aprovação</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Tickets aguardando validação</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {lastUpdate && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}</span>}
          <button onClick={load} style={{ ...inputStyle, cursor: 'pointer', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 600 }}>
            Atualizar
          </button>
        </div>
      </div>

      {actionMsg && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          background: actionMsg.startsWith('Erro') ? '#fee2e2' : '#dcfce7',
          color: actionMsg.startsWith('Erro') ? '#dc2626' : '#16a34a',
          fontWeight: 500, fontSize: '0.875rem',
        }}>
          {actionMsg}
        </div>
      )}

      {/* Count badge */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 14px', borderRadius: 'var(--radius-md)',
          background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.85rem',
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-approval)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Em aprovação:</span>
          <span style={{ fontWeight: 700, color: 'var(--status-approval)' }}>{filtered.length}</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '16px',
        display: 'flex', gap: '10px', flexWrap: 'wrap',
      }}>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} style={inputStyle}>
          <option value="">Todas as entidades</option>
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={inputStyle}>
          <option value="">Todos os grupos</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <button onClick={() => { setFilterEntity(''); setFilterGroup('') }}
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
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>Nenhum ticket aguardando aprovação.</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                {['ID', 'Título', 'Entidade', 'Grupo', 'Técnico', 'Abertura', 'Últ. Atualização', 'Instância', 'Ações'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={t.ticket_id}
                  style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--primary)', whiteSpace: 'nowrap' }}>#{t.ticket_id}</td>
                  <td style={{ padding: '10px 14px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || '—'}</td>
                  <td style={{ padding: '10px 14px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{t.entity || '—'}</td>
                  <td style={{ padding: '10px 14px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{t.group_name || '—'}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{t.technician || '—'}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_created)}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_mod)}</td>
                  <td style={{ padding: '10px 14px' }}><InstanceBadge instance={t.instance} /></td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => handleAction(t.ticket_id, 2, 'aprovado')}
                      style={{
                        padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        background: '#dcfce7', color: '#16a34a', fontWeight: 600, fontSize: '0.8rem', marginRight: '6px',
                      }}
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => handleAction(t.ticket_id, 4, 'rejeitado')}
                      style={{
                        padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        background: '#fee2e2', color: '#dc2626', fontWeight: 600, fontSize: '0.8rem',
                      }}
                    >
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
