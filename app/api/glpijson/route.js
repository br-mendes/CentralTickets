import { NextResponse } from 'next/server'

const INSTANCES = {
  PETA: {
    base: (process.env.NEXT_PUBLIC_GLPI_PETA || 'https://glpi.petacorp.com.br').replace(/\/$/, ''),
    appToken: process.env.PETA_APP_TOKEN || '',
    userToken: process.env.PETA_USER_TOKEN || '',
  },
  GMX: {
    base: (process.env.NEXT_PUBLIC_GLPI_GMX || 'https://glpi.gmxtecnologia.com.br').replace(/\/$/, ''),
    appToken: process.env.GMX_APP_TOKEN || '',
    userToken: process.env.GMX_USER_TOKEN || '',
  },
}

const ITEMTYPES = [
  'Ticket', 'Change', 'User', 'Entity', 'Group',
  'Computer', 'Software', 'License', 'TicketCategory', 'SLA', 'RequestType',
]

async function glpiHeaders(cfg) {
  const h = { 'Content-Type': 'application/json' }
  if (cfg.appToken)  h['App-Token']        = cfg.appToken
  if (cfg.userToken) h['Authorization']     = `user_token ${cfg.userToken}`
  return h
}

async function fetchJson(url, headers) {
  try {
    const r = await fetch(url, { headers, cache: 'no-store' })
    const text = await r.text()
    let data
    try { data = JSON.parse(text) } catch { data = { _raw: text } }
    return { ok: r.ok, status: r.status, data }
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message } }
  }
}

async function probeInstance(name, cfg) {
  const headers = await glpiHeaders(cfg)
  const base = `${cfg.base}/apirest.php`

  const [root, ...searchOptions] = await Promise.all([
    fetchJson(base, headers),
    ...ITEMTYPES.map(t => fetchJson(`${base}/listSearchOptions/${t}`, headers)),
  ])

  return {
    instance: name,
    base: cfg.base,
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
  return NextResponse.json({ peta, gmx }, { status: 200 })
}
