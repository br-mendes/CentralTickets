'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchAllTickets } from '../lib/tickets-api'
import { createClient } from '@supabase/supabase-js'

export default function TesteConsultaPage() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [instance, setInstance] = useState('PETA,GMX')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await fetchAllTickets({ instance })
      setTickets(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [instance])

  useEffect(() => { load() }, [load])

  const [users, setUsers] = useState([])
  const [entities, setEntities] = useState([])
  const [groups, setGroups] = useState([])
  const [reqTypes, setReqTypes] = useState([])

  useEffect(() => {
    async function loadRefs() {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )
      const [u, e, g, r] = await Promise.all([
        supabase.from('glpi_users').select('id, fullname, email, instance'),
        supabase.from('glpi_entities').select('id, name, level, instance'),
        supabase.from('glpi_groups').select('id, name, is_assign, instance'),
        supabase.from('glpi_request_types').select('id, name, instance'),
      ])
      setUsers(u.data || [])
      setEntities(e.data || [])
      setGroups(g.data || [])
      setReqTypes(r.data || [])
    }
    loadRefs()
  }, [])

  if (loading) return <div style={{ padding: '48px', textAlign: 'center' }}>Carregando...</div>
  if (error) return <div style={{ padding: '48px', color: '#dc2626' }}>Erro: {error}</div>

  const sample = tickets[0] || {}

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '16px' }}>Teste de Consulta - Validação de Campos</h1>
      
      <div style={{ marginBottom: '16px' }}>
        <label>Instância: </label>
        <select value={instance} onChange={e => setInstance(e.target.value)} style={{ marginLeft: '8px', padding: '4px 8px' }}>
          <option value="PETA,GMX">PETA + GMX</option>
          <option value="PETA">PETA</option>
          <option value="GMX">GMX</option>
        </select>
        <button onClick={load} style={{ marginLeft: '12px', padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Atualizar</button>
        <span style={{ marginLeft: '12px', fontSize: '0.85rem', color: '#64748b' }}>{tickets.length} tickets</span>
      </div>

      {/* Sample Ticket Fields */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Ticket de Exemplo (ID: {sample.ticket_id})</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
          {Object.entries(sample).map(([key, val]) => (
            <div key={key} style={{ background: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>{key}</div>
              <div style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{String(val ?? '—').substring(0, 200)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Reference Data */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div className="card">
          <h3>GLPI Users ({users.length})</h3>
          <div style={{ fontSize: '0.8rem', maxHeight: '200px', overflow: 'auto' }}>
            {users.slice(0, 20).map(u => (
              <div key={`${u.instance}:${u.id}`} style={{ padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <strong>{u.fullname || '—'}</strong> ({u.instance}) - {u.email}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>GLPI Entities ({entities.length})</h3>
          <div style={{ fontSize: '0.8rem', maxHeight: '200px', overflow: 'auto' }}>
            {entities.slice(0, 20).map(e => (
              <div key={`${e.instance}:${e.id}`} style={{ padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                {e.name} ({e.instance}) - Level: {e.level}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>GLPI Groups ({groups.length})</h3>
          <div style={{ fontSize: '0.8rem', maxHeight: '200px', overflow: 'auto' }}>
            {groups.slice(0, 20).map(g => (
              <div key={`${g.instance}:${g.id}`} style={{ padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                {g.name} ({g.instance}) - Assign: {g.is_assign ? 'Sim' : 'Não'}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>GLPI Request Types ({reqTypes.length})</h3>
          <div style={{ fontSize: '0.8rem', maxHeight: '200px', overflow: 'auto' }}>
            {reqTypes.slice(0, 20).map(rt => (
              <div key={`${rt.instance}:${rt.id}`} style={{ padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                {rt.name} ({rt.instance})
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tickets Table - First 50 */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <h3>Tickets (primeiros 50 de {tickets.length})</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['ticket_id', 'instance', 'title', 'requester_name', 'entity_name', 'group_name', 'channel_name', 'solution_content', 'priority', 'urgency', 'status_key'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.slice(0, 50).map((t, i) => (
              <tr key={`${t.ticket_id}-${t.instance}`} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>#{t.ticket_id}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>{t.instance}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>{t.requester_name || t.requester || '—'}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>{t.entity_name || t.entity || '—'}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>{t.group_name || '—'}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>{t.channel_name || '—'}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.solution_content?.substring(0, 50) || '—'}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>{t.priority || '—'}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>{t.urgency}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>
                  <span className={`status-badge ${t.status_key}`}>{t.status_name || t.status_key}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
