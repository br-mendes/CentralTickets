import { NextResponse } from 'next/server'

const SOPHOS_AUTH_URL = 'https://id.sophos.com/api/v2/oauth2/token'
const SOPHOS_API_REGION = 'https://api-br01.central.sophos.com'

let tokenCache = null
let tokenExpiresAt = 0
let tenantIdCache = null

async function getToken() {
  if (tokenCache && Date.now() < tokenExpiresAt) {
    return tokenCache
  }

  const clientId = process.env.SOPHOS_CLIENT_ID
  const clientSecret = process.env.SOPHOS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Credenciais não configuradas')
  }

  const res = await fetch(SOPHOS_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'token',
    }),
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    tokenCache = null
    tokenExpiresAt = 0
    throw new Error(`Auth falhou: ${res.status} - ${text.substring(0, 200)}`)
  }

  if (!data.access_token) {
    tokenCache = null
    tokenExpiresAt = 0
    throw new Error(`Token não obtido: ${text.substring(0, 200)}`)
  }

  tokenCache = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
  console.log('Token obtido, expira em:', data.expires_in, 'segundos')
  return tokenCache
}

async function getTenantId() {
  if (tenantIdCache) {
    return { id: tenantIdCache, apiHost: SOPHOS_API_REGION, idType: 'partner' }
  }

  const token = await getToken()
  const whoRes = await fetch('https://api.central.sophos.com/whoami/v1', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const whoData = await whoRes.json()

  console.log('WHOAMI:', JSON.stringify(whoData).substring(0, 500))

  let id = null
  let idType = whoData.idType || 'partner'
  let apiHost = whoData.apiHost?.global || whoData.apiHost || SOPHOS_API_REGION

  if (idType === 'tenant') {
    id = whoData.id
  } else if (whoData.tenants && whoData.tenants.length > 0) {
    id = whoData.tenants[0].id
    apiHost = whoData.tenants[0].apiHost || SOPHOS_API_REGION
  } else if (whoData.id) {
    id = whoData.id
  }

  if (!id) {
    throw new Error(`Tenant não encontrado`)
  }

  tenantIdCache = id
  return { id, apiHost, idType }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint') || 'whoami'

  try {
    const token = await getToken()
    const tenant = await getTenantId()

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    if (tenant.idType === 'partner') {
      headers['X-Partner-ID'] = tenant.id
    } else if (tenant.idType === 'organization') {
      headers['X-Organization-ID'] = tenant.id
    } else {
      headers['X-Tenant-ID'] = tenant.id
    }

    let url
    let apiHost = tenant.apiHost

    switch (endpoint) {
      case 'whoami':
        url = 'https://api.central.sophos.com/whoami/v1'
        break

      case 'tenants':
        if (tenant.idType === 'partner') {
          headers['X-Partner-ID'] = tenant.id
        } else if (tenant.idType === 'organization') {
          headers['X-Organization-ID'] = tenant.id
        }
        url = tenant.idType === 'partner' 
          ? 'https://api.central.sophos.com/partner/v1/tenants'
          : 'https://api.central.sophos.com/organization/v1/tenants'
        break

      case 'endpoints':
      case 'endpoint-groups':
      case 'threats':
      case 'isolated-endpoints':
        headers['X-Tenant-ID'] = tenant.id
        url = `${apiHost}/endpoint/v1/${endpoint === 'isolated-endpoints' ? 'endpoints?isolationStatus=isolated' : endpoint}`
        break

      case 'alerts':
      case 'users':
      case 'user-groups':
        headers['X-Tenant-ID'] = tenant.id
        url = `${apiHost}/common/v1/${endpoint}`
        break

      case 'cases':
        headers['X-Tenant-ID'] = tenant.id
        url = `${apiHost}/cases/v1/cases`
        break

      case 'siem-events':
      case 'siem-alerts':
        headers['X-Tenant-ID'] = tenant.id
        url = `${apiHost}/siem/v1/${endpoint === 'siem-events' ? 'events' : 'alerts'}`
        break

      default:
        headers['X-Tenant-ID'] = tenant.id
        url = `${apiHost}/endpoint/v1/${endpoint}`
    }

    const apiRes = await fetch(url, { headers })

    const text = await apiRes.text()
    console.log(`Sophos ${endpoint}: ${apiRes.status}`, text.substring(0, 300), 'URL:', url, 'Headers:', JSON.stringify(headers))

    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text }
    }

    return NextResponse.json(json, { status: apiRes.status })
  } catch (error) {
    console.error('Sophos error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    const token = await getToken()
    const tenant = await getTenantId()
    const body = await request.json().catch(() => ({}))

    let url
    let apiHost = tenant.apiHost

    switch (action) {
      case 'isolate-endpoint':
        url = `${apiHost}/endpoint/v1/endpoints/${body.endpointId}/isolation`
        break
      case 'unisolate-endpoint':
        url = `${apiHost}/endpoint/v1/endpoints/${body.endpointId}/isolation`
        break
      case 'scan-endpoint':
        url = `${apiHost}/endpoint/v1/endpoints/${body.endpointId}/scans`
        break
      default:
        return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 })
    }

    const method = action === 'unisolate-endpoint' ? 'DELETE' : 'POST'

    const apiRes = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-ID': tenant.id,
        'Content-Type': 'application/json',
      },
      body: method !== 'DELETE' ? JSON.stringify(body) : undefined,
    })

    const json = await apiRes.json()
    return NextResponse.json(json, { status: apiRes.status })
  } catch (error) {
    console.error('Sophos POST error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}