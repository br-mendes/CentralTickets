'use client'

import { useEffect, useState } from 'react'

export default function TesteConsulta() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  return (
    <div style={{ padding: 20, fontFamily: 'monospace', fontSize: 14 }}>
      <h1>Teste de Consulta - API /api/testeconsulta</h1>
      
      <div style={{ marginBottom: 20 }}>
        <strong>Total de tickets encontrados:</strong> {data.total_tickets || 0}<br/>
        <strong>Exibindo dados do ticket ID:</strong> {data.sample_ticket_id} ({data.instance})
      </div>

      <h2>Campos do primeiro ticket:</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 30 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Campo</th>
            <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Tipo</th>
            <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Valor</th>
            <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.fields?.map((f, i) => (
            <tr key={i} style={{ background: f.isNull ? '#fff0f0' : f.isEmpty ? '#f0f0ff' : 'white' }}>
              <td style={{ border: '1px solid #ddd', padding: 8, fontWeight: 'bold' }}>{f.field}</td>
              <td style={{ border: '1px solid #ddd', padding: 8 }}>{f.type}</td>
              <td style={{ border: '1px solid #ddd', padding: 8, maxWidth: 400, overflow: 'auto' }}>
                {f.isNull ? (
                  <span style={{ color: 'red' }}>NULL</span>
                ) : f.isEmpty ? (
                  <span style={{ color: 'orange' }}>'(vazio)'</span>
                ) : (
                  <span>{String(f.value)}</span>
                )}
              </td>
              <td style={{ border: '1px solid #ddd', padding: 8 }}>
                {f.isNull && <span style={{ color: 'red', fontSize: 12 }}>NULL</span>}
                {f.isEmpty && <span style={{ color: 'orange', fontSize: 12 }}>Vazio</span>}
                {!f.isNull && !f.isEmpty && <span style={{ color: 'green', fontSize: 12 }}>OK</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Todos os tickets (resumo):</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>#</th>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>Ticket ID</th>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>Instância</th>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>Título</th>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>Técnico</th>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>Técnico (Nome)</th>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>Solicitante</th>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>Solicitante (Nome)</th>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>Grupo</th>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>Status</th>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>SLA %</th>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>SLA Late</th>
          </tr>
        </thead>
        <tbody>
          {data.all_tickets?.map((t, i) => (
            <tr key={i}>
              <td style={{ border: '1px solid #ddd', padding: 8 }}>{i + 1}</td>
              <td style={{ border: '1px solid #ddd', padding: 8 }}>{t.ticket_id}</td>
              <td style={{ border: '1px solid #ddd', padding: 8 }}>{t.instance}</td>
              <td style={{ border: '1px solid #ddd', padding: 8, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</td>
              <td style={{ border: '1px solid #ddd', padding: 8 }}>{t.technician || '(vazio)'}</td>
              <td style={{ border: '1px solid #ddd', padding: 8, fontWeight: t.technician_name ? 'bold' : 'normal', color: t.technician_name ? 'green' : 'red' }}>{t.technician_name || '(vazio)'}</td>
              <td style={{ border: '1px solid #ddd', padding: 8 }}>{t.requester || '(vazio)'}</td>
              <td style={{ border: '1px solid #ddd', padding: 8, fontWeight: t.requester_name ? 'bold' : 'normal', color: t.requester_name ? 'green' : 'red' }}>{t.requester_name || '(vazio)'}</td>
              <td style={{ border: '1px solid #ddd', padding: 8 }}>{t.group_name || '(vazio)'}</td>
              <td style={{ border: '1px solid #ddd', padding: 8 }}>{t.status_name || t.status_key}</td>
              <td style={{ border: '1px solid #ddd', padding: 8 }}>{t.sla_percentage_first?.toFixed(1) || '0'}%</td>
              <td style={{ border: '1px solid #ddd', padding: 8, color: t.is_sla_late ? 'red' : 'green' }}>{String(t.is_sla_late)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Dados brutos (JSON):</h2>
      <pre style={{ background: '#f5f5f5', padding: 15, overflow: 'auto', maxHeight: 400, fontSize: 12 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}
