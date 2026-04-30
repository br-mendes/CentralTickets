'use client'

import { useEffect, useState } from 'react'

const ITEMTYPES = [
  { name: 'Ticket', fields: '1,2,3,4,5,7,8,9,10,12,14,15,17,18,19,20,22,55,80,83,151' },
  { name: 'Change', fields: '1,2,3,4,5,7,8,9,10,12,14,15,17,18,19,20,55,80' },
  { name: 'User', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20' },
  { name: 'Entity', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20' },
  { name: 'Group', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20' },
  { name: 'Computer', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20' },
  { name: 'Software', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20' },
  { name: 'TicketCategory', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20' },
  { name: 'RequestType', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20' },
  { name: 'SLA', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20' },
]

const API_CONFIG = {
  PETA: {
    url: process.env.NEXT_PUBLIC_GLPI_PETA,
    userToken: process.env.PETA_USER_TOKEN,
    appToken: process.env.PETA_APP_TOKEN,
  },
  GMX: {
    url: process.env.NEXT_PUBLIC_GLPI_GMX,
    userToken: process.env.GMX_USER_TOKEN,
    appToken: process.env.GMX_APP_TOKEN,
  },
}

async function initSession(config) {
  const res = await fetch(`${config.url}/initSession`, {
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': `user_token ${config.userToken}`, 
      'App-Token': config.appToken 
    },
  })
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`)
  const data = await res.json()
  return data.session_token
}

async function fetchItem(config, itemtype, fields) {
  const token = await initSession(config)
  let url = `${config.url}/search/${itemtype}?range=0-0&expand_dropdowns=true&get_hateoas=false`
  fields.split(',').forEach((id, i) => url += `&forcedisplay[${i}]=${id}`)
  
  const res = await fetch(url, {
    headers: { 
      'Content-Type': 'application/json', 
      'Session-Token': token, 
      'App-Token': config.appToken 
    },
  })
  if (!res.ok) return { error: `HTTP ${res.status}` }
  const data = await res.json()
  return data.data?.[0] || { note: 'Nenhum registro' }
}

export default function GLPIJson() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [instance, setInstance] = useState('PETA')

  useEffect(() => {
    loadData()
  }, [instance])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const config = API_CONFIG[instance]
      if (!config.url || !config.userToken || !config.appToken) {
        throw new Error(`Configuração incomplete for ${instance}`)
      }

      const results = { _instance: instance, _timestamp: new Date().toISOString() }
      
      for (const it of ITEMTYPES) {
        try {
          results[it.name] = await fetchItem(config, it.name, it.fields)
        } catch (e) {
          results[it.name] = { error: String(e) }
        }
      }
      
      setData(results)
    } catch (e) {
      setError(e.message)
    }
    
    setLoading(false)
  }

  if (loading) return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#020617', 
      color: '#475569', 
      fontFamily: 'ui-monospace, monospace', 
      padding: 40, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center' 
    }}>
      🔄 Consultando GLPI ({instance}) em tempo real...
    </div>
  )

  if (error) return (
    <div style={{ padding: 40, color: '#ef4444', background: '#0a0a0a', minHeight: '100vh', fontFamily: 'monospace' }}>
      <h2>Erro:</h2>
      <pre>{error}</pre>
      <button onClick={loadData} style={{ padding: '10px 20px', marginTop: 20, cursor: 'pointer' }}>
        Tentar novamente
      </button>
    </div>
  )

  return (
    <div style={{ 
      padding: 20, 
      fontFamily: 'ui-monospace, monospace', 
      fontSize: 12,
      background: '#0a0a0a',
      minHeight: '100vh',
      color: '#e5e5e5'
    }}>
      <div style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, color: '#fff', fontSize: 20 }}>GLPI JSON - Tempo Real</h1>
          <span style={{ color: '#666', fontSize: 11 }}>
            {data?._timestamp ? `Atualizado: ${new Date(data._timestamp).toLocaleString()}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select 
            value={instance} 
            onChange={e => setInstance(e.target.value)}
            style={{ 
              padding: '8px 12px', 
              borderRadius: 6, 
              border: '1px solid #333', 
              background: '#1a1a1a', 
              color: '#fff',
              fontSize: 14
            }}
          >
            <option value="PETA">PETA</option>
            <option value="GMX">GMX</option>
          </select>
          <button 
            onClick={loadData}
            style={{ 
              padding: '8px 16px', 
              borderRadius: 6, 
              border: '1px solid #2563eb', 
              background: '#2563eb', 
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            🔄 Atualizar
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 15 }}>
        {ITEMTYPES.map(it => (
          <div key={it.name} style={{ 
            background: '#111', 
            border: '1px solid #222', 
            borderRadius: 8,
            overflow: 'hidden'
          }}>
            <div style={{ 
              background: '#1a1a1a', 
              padding: '8px 12px', 
              borderBottom: '1px solid #222',
              fontWeight: 'bold',
              color: '#22c55e',
              fontSize: 13
            }}>
              {it.name}
            </div>
            <pre style={{ 
              margin: 0, 
              padding: 12, 
              fontSize: 10, 
              overflow: 'auto', 
              maxHeight: 250,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
{JSON.stringify(data?.[it.name] || {}, null, 2)}
            </pre>
          </div>
        ))}
      </div>

      <details style={{ marginTop: 30, color: '#666' }}>
        <summary style={{ cursor: 'pointer' }}>JSON completo</summary>
        <pre style={{ background: '#111', padding: 20, overflow: 'auto', maxHeight: 600, fontSize: 10 }}>
{JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  )
}