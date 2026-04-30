'use client'
import { useEffect, useState, useCallback } from 'react'

const ITEMTYPES = [
  'Ticket', 'Change', 'User', 'Entity', 'Group',
  'Computer', 'Software', 'License', 'TicketCategory', 'SLA', 'RequestType',
]

// ── JSON tree renderer ────────────────────────────────────────────────────────

function JsonNode({ data, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2)
  if (data === null || data === undefined) return <span style={s.null}>null</span>
  if (typeof data === 'boolean') return <span style={s.bool}>{String(data)}</span>
  if (typeof data === 'number') return <span style={s.num}>{data}</span>
  if (typeof data === 'string') return <span style={s.str}>"{data}"</span>

  const isArray = Array.isArray(data)
  const entries = isArray ? data.map((v, i) => [i, v]) : Object.entries(data)
  const preview = isArray
    ? `[ ${entries.length} items ]`
    : `{ ${entries.slice(0, 3).map(([k]) => k).join(', ')}${entries.length > 3 ? ', …' : ''} }`

  if (entries.length === 0) return <span style={s.muted}>{isArray ? '[]' : '{}'}</span>

  return (
    <span>
      <button onClick={() => setOpen(o => !o)} style={s.toggle}>{open ? '▾' : '▸'}</button>
      {!open && <span style={s.muted}> {preview}</span>}
      {open && (
        <span>
          {entries.map(([k, v]) => (
            <div key={k} style={{ marginLeft: 16 }}>
              <span style={s.key}>{isArray ? k : `"${k}"`}</span>
              <span style={s.colon}>: </span>
              <JsonNode data={v} depth={depth + 1} />
            </div>
          ))}
        </span>
      )}
    </span>
  )
}

const s = {
  key:    { color: '#93c5fd' },
  str:    { color: '#86efac' },
  num:    { color: '#fcd34d' },
  bool:   { color: '#f9a8d4' },
  null:   { color: '#94a3b8' },
  muted:  { color: '#64748b' },
  colon:  { color: '#94a3b8' },
  toggle: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#94a3b8', padding: '0 2px', fontSize: '0.7rem',
  },
}

// ── Panel for one instance ────────────────────────────────────────────────────

function InstancePanel({ name, data }) {
  const [active, setActive] = useState('root')

  const tabs = [
    { key: 'root', label: 'API root', content: data.root },
    ...ITEMTYPES.map(t => ({ key: t, label: t, content: data.searchOptions?.[t] })),
  ]

  const cur = tabs.find(t => t.key === active)

  return (
    <div style={{ marginBottom: 32, border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden' }}>
      {/* Instance header */}
      <div style={{ background: '#0f172a', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#38bdf8' }}>{name}</span>
        <span style={{ fontSize: '0.72rem', color: '#475569' }}>{data.base}</span>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, background: '#0f172a', padding: '0 12px 8px' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            style={{
              padding: '4px 10px', borderRadius: 4, fontSize: '0.72rem', border: 'none', cursor: 'pointer',
              background: active === t.key ? '#1e40af' : '#1e293b',
              color: active === t.key ? '#fff' : '#94a3b8',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16, background: '#020617', fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: 1.6, overflowX: 'auto' }}>
        {cur?.content !== undefined
          ? <JsonNode data={cur.content} depth={0} />
          : <span style={s.muted}>Sem dados</span>
        }
      </div>
    </div>
  )
}

// ── Search across all loaded data ─────────────────────────────────────────────

function SearchBar({ payload, onResults }) {
  const [q, setQ] = useState('')

  const search = useCallback((query) => {
    if (!query.trim() || !payload) { onResults(null); return }
    const lower = query.toLowerCase()
    const hits = []
    const walk = (obj, path) => {
      if (typeof obj === 'string' && obj.toLowerCase().includes(lower)) {
        hits.push({ path, value: obj })
      } else if (typeof obj === 'number' && String(obj).includes(lower)) {
        hits.push({ path, value: obj })
      } else if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          walk(v, `${path}.${k}`)
        }
      }
    }
    for (const [inst, idata] of Object.entries(payload)) {
      walk(idata, inst)
    }
    onResults(hits.slice(0, 200))
  }, [payload, onResults])

  useEffect(() => { search(q) }, [q, search])

  return (
    <div style={{ marginBottom: 24 }}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar em todos os campos (nome, ID, label…)"
        style={{
          width: '100%', boxSizing: 'border-box', padding: '8px 14px',
          background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6,
          color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.82rem',
          outline: 'none',
        }}
      />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GlpiJsonPage() {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)

  useEffect(() => {
    fetch('/api/glpijson')
      .then(r => r.json())
      .then(d => { setPayload(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const containerStyle = {
    minHeight: '100vh', background: '#020617', color: '#e2e8f0',
    fontFamily: 'ui-monospace, monospace', padding: '24px 20px',
  }

  if (loading) return (
    <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
      Consultando GLPI…
    </div>
  )

  if (error) return (
    <div style={{ ...containerStyle, color: '#f87171' }}>
      Erro: {error}
    </div>
  )

  return (
    <div style={containerStyle}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8', margin: 0 }}>
            GLPI JSON Explorer
          </h1>
          <p style={{ fontSize: '0.72rem', color: '#475569', margin: '4px 0 0' }}>
            listSearchOptions · PETA + GMX · /apirest.php
          </p>
        </div>

        <SearchBar payload={payload} onResults={setResults} />

        {results !== null ? (
          <div>
            <div style={{ fontSize: '0.72rem', color: '#475569', marginBottom: 12 }}>
              {results.length} resultado(s)
            </div>
            {results.map((r, i) => (
              <div key={i} style={{ background: '#0f172a', borderRadius: 6, padding: '8px 14px', marginBottom: 6, fontSize: '0.75rem' }}>
                <div style={{ color: '#94a3b8', marginBottom: 2 }}>{r.path}</div>
                <div style={{ color: '#86efac' }}>{JSON.stringify(r.value)}</div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {payload?.peta && <InstancePanel name="PETA" data={payload.peta} />}
            {payload?.gmx  && <InstancePanel name="GMX"  data={payload.gmx}  />}
          </>
        )}
      </div>
    </div>
  )
}
