import { NextResponse } from 'next/server'

const SOPHOS_AUTH_URL = 'https://id.sophos.com/api/v2/oauth2/token'
const SOPHOS_API_GLOBAL = 'https://api.central.sophos.com'
const SOPHOS_REGION = 'br01'
const SOPHOS_API_REGION = `https://api-${SOPHOS_REGION}.central.sophos.com`

async function getSophosToken() {
  const clientId = process.env.SOPHOS_CLIENT_ID
  const clientSecret = process.env.SOPHOS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Credenciais Sophos não configuradas')
  }

  const response = await fetch(SOPHOS_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'token',
    }),
  })

  if (!response.ok) {
    const status = response.status
    const errorText = await response.text().catch(() => 'Unknown error')
    console.error('Auth error:', status, errorText)
    if (status === 401) {
      throw new Error('Credenciais Sophos inválidas ou sem acesso. Verifique o Service Principal no painel Sophos.')
    }
    throw new Error(`Falha na autenticação Sophos: HTTP ${status} - ${errorText}`)
  }

  const data = await response.json()
  if (!data.access_token) {
    throw new Error('Token de acesso não retornado')
  }
  return data.access_token
}

async function getSophosWhoami(token) {
  const response = await fetch(`${SOPHOS_API_GLOBAL}/whoami/v1`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Erro whoami: ${response.status} - ${errorText}`)
  }

  return response.json()
}

async function getTenantId(token, organizationId, idType = 'organization') {
  const path = idType === 'partner' ? 'partner/v1/tenants' : 'organization/v1/tenants'
  const headerKey = idType === 'partner' ? 'X-Partner-ID' : 'X-Organization-ID'
  const response = await fetch(`${SOPHOS_API_GLOBAL}/${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      [headerKey]: organizationId,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Tenants error:', response.status, errorText)
    return null
  }

  const data = await response.json()
  if (data.items && data.items.length > 0) {
    const tenant = data.items[0]
    return { id: tenant.id, apiHost: tenant.apiHost }
  }
  return null
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint') || 'whoami'
  const tenantId = searchParams.get('tenantId') || ''

  try {
    const token = await getSophosToken()
    const whoami = await getSophosWhoami(token)
    const organizationId = whoami?.id
    const idType = whoami?.idType || 'organization'

    let tenantInfo = null
    let tenantApiHost = null
    if (!tenantId && organizationId) {
      tenantInfo = await getTenantId(token, organizationId, idType)
      tenantApiHost = tenantInfo?.apiHost || SOPHOS_API_GLOBAL
    } else {
      tenantApiHost = SOPHOS_API_GLOBAL
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    if (idType === 'partner') {
      headers['X-Partner-ID'] = organizationId
    } else {
      headers['X-Organization-ID'] = organizationId
    }

    if (tenantInfo?.id) {
      headers['X-Tenant-ID'] = tenantInfo.id
    }

    let url
    switch (endpoint) {
      case 'whoami':
        return NextResponse.json(whoami)

      case 'tenants':
        url = whoami?.idType === 'partner' 
          ? `${SOPHOS_API_GLOBAL}/partner/v1/tenants` 
          : `${SOPHOS_API_GLOBAL}/organization/v1/tenants`
        break

      case 'endpoints':
        url = `${tenantApiHost}/endpoint/v1/endpoints`
        break

      case 'endpoint-groups':
        url = `${tenantApiHost}/endpoint/v1/endpoint-groups`
        break

      case 'alerts':
        url = `${tenantApiHost}/common/v1/alerts`
        break

      case 'cases':
        url = `${tenantApiHost}/cases/v1/cases`
        break

      case 'siem-events':
        url = `${tenantApiHost}/siem/v1/events`
        break

      case 'siem-alerts':
        url = `${tenantApiHost}/siem/v1/alerts`
        break

      case 'users':
        url = `${tenantApiHost}/common/v1/users`
        break

      case 'user-groups':
        url = `${tenantApiHost}/common/v1/user-groups`
        break

      case 'threats':
        url = `${tenantApiHost}/endpoint/v1/threats`
        break

      case 'isolated-endpoints':
        url = `${tenantApiHost}/endpoint/v1/endpoints?isolationStatus=isolated`
        break

      default:
        return NextResponse.json({ error: `Endpoint desconhecido: ${endpoint}` }, { status: 400 })
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`API error ${endpoint}:`, response.status, errorText)
      return NextResponse.json({
        error: `Erro na API Sophos: ${response.status}`,
        details: errorText,
      }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error('Sophos API error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    const token = await getSophosToken()
    const whoami = await getSophosWhoami(token)
    const organizationId = whoami?.id
    const idType = whoami?.idType || 'organization'

    const body = await request.json().catch(() => ({}))
    const tenantId = body.tenantId

    let tenantInfo = null
    let tenantApiHost = SOPHOS_API_GLOBAL
    if (!tenantId && organizationId) {
      tenantInfo = await getTenantId(token, organizationId, idType)
      tenantApiHost = tenantInfo?.apiHost || SOPHOS_API_GLOBAL
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    if (idType === 'partner') {
      headers['X-Partner-ID'] = organizationId
    } else {
      headers['X-Organization-ID'] = organizationId
    }

    if (tenantInfo?.id) {
      headers['X-Tenant-ID'] = tenantInfo.id
    } else if (tenantId) {
      headers['X-Tenant-ID'] = tenantId
    }

    let url
    switch (action) {
      case 'isolate-endpoint':
        url = `${tenantApiHost}/endpoint/v1/endpoints/${body.endpointId}/isolation`
        break

      case 'unisolate-endpoint':
        url = `${tenantApiHost}/endpoint/v1/endpoints/${body.endpointId}/isolation`
        break

      case 'scan-endpoint':
        url = `${tenantApiHost}/endpoint/v1/endpoints/${body.endpointId}/scans`
        break

      default:
        return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 })
    }

    const method = action === 'unisolate-endpoint' ? 'DELETE' : 'POST'

    const response = await fetch(url, {
      method,
      headers,
      body: method !== 'DELETE' ? JSON.stringify(body) : undefined
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({
        error: `Erro na API Sophos: ${response.status}`,
        details: errorText,
      }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error('Sophos POST error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}