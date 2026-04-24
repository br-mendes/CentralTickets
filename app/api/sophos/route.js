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
    const error = await response.text()
    throw new Error(`Falha na autenticação Sophos: ${error}`)
  }

  const data = await response.json()
  return data.access_token
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint') || 'whoami'

  try {
    const token = await getSophosToken()

    let url, headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    switch (endpoint) {
      case 'whoami':
        url = `${SOPHOS_API_GLOBAL}/whoami/v1`
        break

      case 'tenants':
        url = `${SOPHOS_API_GLOBAL}/partner/v1/tenants`
        break

      case 'endpoints':
        url = `${SOPHOS_API_REGION}/endpoint/v1/endpoints`
        break

      case 'alerts':
        url = `${SOPHOS_API_REGION}/common/v1/alerts`
        break

      case 'cases':
        url = `${SOPHOS_API_REGION}/cases/v1/cases`
        break

      case 'devices':
        url = `${SOPHOS_API_REGION}/endpoint/v1/devices`
        break

      case 'users':
        url = `${SOPHOS_API_REGION}/common/v1/users`
        break

      default:
        return NextResponse.json({ error: `Endpoint desconhecido: ${endpoint}` }, { status: 400 })
    }

    const response = await fetch(url, { headers })

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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}