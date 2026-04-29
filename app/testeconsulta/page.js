'use client'

import { useEffect, useState } from 'react'

export default function TesteConsulta() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAllFields, setShowAllFields] = useState(false)

  useEffect(() => {
    fetch('/api/testeconsulta')
      .then(res => res.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  if (loading) return <div style={{ padding: 20 }}>Carregando...</div>
  if (error) return <div style={{ padding: 20, color: 'red' }}>Erro: {error}</div>
  if (!data) return <div style={{ padding: 20 }}>Nenhum dado encontrado</div>

  const importantFields = [
    'ticket_id', 'instance', 'title', 'entity', 'category', 
    'technician', 'technician_id', 'technician_name',
    'requester', 'requester_id', 'requester_name',
    'group_name', 'group_id', 'status_key', 'status_name', 'status_id',
    'priority', 'priority_id', 'type_id', 'urgency', 'impact',
    'date_created', 'date_mod', 'date_solved', 'due_date',
    'is_sla_late', 'is_overdue_first', 'is_overdue_resolve',
    'sla_percentage_first', 'sla_percentage_resolve',
    'solution', 'content', 'location', 'request_source', 'request_type',
    'entity_id', 'request_type_id'
  ]

  return (
    <div style={{ padding: 20, fontFamily: 'monospace', fontSize: 13 }}>
      <h1>Teste de Consulta - API /api/testeconsulta</h1>
      
      <div style={{ marginBottom: 20, padding: 10, background: '#f0f0f0' }}>
        <strong>Total de tickets encontrados:</strong> {data.total_tickets || 0}
      </div>

      <h2>Campos do primeiro ticket ({data.sample_ticket_id}):</h2>
      <button onClick={() => setShowAllFields(!showAllFields)} style={{ marginBottom: 10, padding: '5px 10px' }}>
        {showAllFields ? 'Mostrar apenas campos importantes' : 'Mostrar todos os campos'}
      </button>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 30, fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'left' }}>Campo</th>
            <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'left' }}>Tipo</th>
            <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'left' }}>Valor</th>
            <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'left' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {(showAllFields ? data.fields : data.fields?.filter(f => importantFields.includes(f.field)))?.map((f, i) => (
            <tr key={i} style={{ background: f.isNull ? '#fff0f0' : f.isEmpty ? '#f0f0ff' : 'white' }}>
              <td style={{ border: '1px solid #ddd', padding: 6, fontWeight: 'bold' }}>{f.field}</td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>{f.type}</td>
              <td style={{ border: '1px solid #ddd', padding: 6, maxWidth: 400, overflow: 'auto', fontSize: 11 }}>
                {f.isNull ? (
                  <span style={{ color: 'red' }}>NULL</span>
                ) : f.isEmpty ? (
                  <span style={{ color: 'orange' }}>(vazio)</span>
                ) : (
                  <span>{String(f.value)}</span>
                )}
              </td>
              <td style={{ border: '1px solid #ddd', padding: 6 }}>
                {f.isNull && <span style={{ color: 'red', fontSize: 11 }}>NULL</span>}
                {f.isEmpty && <span style={{ color: 'orange', fontSize: 11 }}>Vazio</span>}
                {!f.isNull && !f.isEmpty && <span style={{ color: 'green', fontSize: 11 }}>OK</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Todos os tickets ({data.all_tickets?.length}):</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>#</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>ID</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>Inst</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>Título</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>Técnico</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>Técnico Nome</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>Solicitante</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>Solicitante Nome</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>Grupo</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>Status</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>SLA %</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>Late</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>Due Date</th>
              <th style={{ border: '1px solid #ddd', padding: 4 }}>Entidade</th>
            </tr>
          </thead>
          <tbody>
            {data.all_tickets?.map((t, i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #ddd', padding: 4 }}>{i + 1}</td>
                <td style={{ border: '1px solid #ddd', padding: 4 }}>{t.ticket_id}</td>
                <td style={{ border: '1px solid #ddd', padding: 4 }}>{t.instance}</td>
                <td style={{ border: '1px solid #ddd', padding: 4, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</td>
                <td style={{ border: '1px solid #ddd', padding: 4 }}>{t.technician || '-'}</td>
                <td style={{ border: '1px solid #ddd', padding: 4, color: t.technician_name !== '(vazio)' ? 'green' : 'orange' }}>{t.technician_name || '-'}</td>
                <td style={{ border: '1px solid #ddd', padding: 4 }}>{t.requester || '-'}</td>
                <td style={{ border: '1px solid #ddd', padding: 4, color: t.requester_name !== '(vazio)' ? 'green' : 'orange' }}>{t.requester_name || '-'}</td>
                <td style={{ border: '1px solid #ddd', padding: 4 }}>{t.group_name || '-'}</td>
                <td style={{ border: '1px solid #ddd', padding: 4 }}>{t.status_name || t.status_key}</td>
                <td style={{ border: '1px solid #ddd', padding: 4, color: t.sla_percentage_first >= 100 ? 'red' : t.sla_percentage_first >= 70 ? 'orange' : 'green' }}>
                  {t.sla_percentage_first?.toFixed(0) || '0'}%
                </td>
                <td style={{ border: '1px solid #ddd', padding: 4, color: t.is_sla_late ? 'red' : 'green' }}>
                  {String(t.is_sla_late)}
                </td>
                <td style={{ border: '1px solid #ddd', padding: 4 }}>{t.due_date?.substring(0, 10) || '-'}</td>
                <td style={{ border: '1px solid #ddd', padding: 4, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.entity || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details style={{ marginTop: 30 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Dados brutos (JSON) - Clique para expandir</summary>
        <pre style={{ background: '#f5f5f5', padding: 15, overflow: 'auto', maxHeight: 600, fontSize: 11 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  )
}