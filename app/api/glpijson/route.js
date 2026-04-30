import { NextResponse } from 'next/server'

const INSTANCES = {
  PETA: {
    base: (
      process.env.NEXT_PUBLIC_GLPI_PETA ||
      ''
    ).replace(/\/$/, ''),
    appToken: process.env.PETA_APP_TOKEN || '',
    userToken: process.env.PETA_USER_TOKEN || '',
  },
  GMX: {
    base: (
      process.env.NEXT_PUBLIC_GLPI_GMX ||
      ''
    ).replace(/\/$/, ''),
    appToken: process.env.GMX_APP_TOKEN || '',
    userToken: process.env.GMX_USER_TOKEN || '',
  },
}

for (const [name, cfg] of Object.entries(INSTANCES)) {
  if (!cfg.base) console.warn(`[glpijson] ${name} base URL not configured — set NEXT_PUBLIC_GLPI_${name}`)
}

const ITEMTYPES = [
  'Ticket', 'Change', 'User', 'Entity', 'Group',
  'Computer', 'Software', 'License', 'TicketCategory', 'SLA', 'RequestType',
]

function glpiHeaders(cfg) {
  const h = { 'Content-Type': 'application/json' }
  if (cfg.appToken)  h['App-Token']    = cfg.appToken
  if (cfg.userToken) h['Authorization'] = `user_token ${cfg.userToken}`
  return h
}

async function fetchJson(url, headers, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(url, { headers, cache: 'no-store', signal: controller.signal })
    const text = await r.text()
    let data
    try { data = JSON.parse(text) } catch { data = { _raw: text } }
    return { ok: r.ok, status: r.status, data }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: { error: e?.name === 'AbortError' ? 'Request timeout' : e.message },
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function probeInstance(name, cfg) {
  if (!cfg.base) {
    return { instance: name, base: '', ok: false, root: { error: 'base URL not configured' }, searchOptions: {} }
  }
  const headers = glpiHeaders(cfg)
  const base = `${cfg.base}/apirest.php`

  const [root, ...searchOptions] = await Promise.all([
    fetchJson(base, headers),
    ...ITEMTYPES.map(t => fetchJson(`${base}/listSearchOptions/${t}`, headers)),
  ])

  const ok = root.ok && searchOptions.every(r => r.ok)
  return {
    instance: name,
    base: cfg.base,
    ok,
    root: root.data,
    searchOptions: Object.fromEntries(
      ITEMTYPES.map((t, i) => [t, searchOptions[i].data])
    ),
  }
}

export async function GET() {
  const [peta, gmx] = await Promise.all([
    probeInstance('PETA', INSTANCES.PETA),
    probeInstance('GMX', INSTANCES.GMX),
  ])
  const status = (peta.ok || gmx.ok) ? 200 : 502
  return NextResponse.json({ peta, gmx }, { status })
}