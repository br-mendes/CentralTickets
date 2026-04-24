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

  const data = await res.json()
  if (!data.access_token) {
    throw new Error('Token não obtido')
  }

  tokenCache = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
  return tokenCache
}

async function getTenantId() {
  if (tenantIdCache) {
    return tenantIdCache
  }

  const token = await getToken()
  const whoRes = await fetch('https://api.central.sophos.com/whoami/v1', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const whoData = await whoRes.json()

  if (whoData.idType === 'tenant') {
    tenantIdCache = whoData.id
  } else if (whoData.tenants && whoData.tenants.length > 0) {
    tenantIdCache = whoData.tenants[0].id
  } else {
    throw new Error('Tenant não encontrado')
  }

  return tenantIdCache
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint') || 'whoami'

  try {
    const token = await getToken()
    const tid = await getTenantId()

    let url
    switch (endpoint) {
      case 'whoami':
        url = 'https://api.central.sophos.com/whoami/v1'
        break

      case 'tenants':
        url = 'https://api.central.sophos.com/partner/v1/tenants'
        break

      case 'endpoints':
      case 'endpoint-groups':
      case 'threats':
      case 'isolated-endpoints':
        url = `${SOPHOS_API_REGION}/endpoint/v1/${endpoint === 'isolated-endpoints' ? 'endpoints?isolationStatus=isolated' : endpoint}`
        break

      case 'alerts':
      case 'users':
      case 'user-groups':
        url = `${SOPHOS_API_REGION}/common/v1/${endpoint}`
        break

      case 'cases':
        url = `${SOPHOS_API_REGION}/cases/v1/cases`
        break

      default:
        url = `${SOPHOS_API_REGION}/endpoint/v1/${endpoint}`
    }

    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-ID': tid,
      },
    })

    const json = await apiRes.json()
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
    const tid = await getTenantId()
    const body = await request.json().catch(() => ({}))

    let url
    switch (action) {
      case 'isolate-endpoint':
        url = `${SOPHOS_API_REGION}/endpoint/v1/endpoints/${body.endpointId}/isolation`
        break
      case 'unisolate-endpoint':
        url = `${SOPHOS_API_REGION}/endpoint/v1/endpoints/${body.endpointId}/isolation`
        break
      case 'scan-endpoint':
        url = `${SOPHOS_API_REGION}/endpoint/v1/endpoints/${body.endpointId}/scans`
        break
      default:
        return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 })
    }

    const method = action === 'unisolate-endpoint' ? 'DELETE' : 'POST'

    const apiRes = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-ID': tid,
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