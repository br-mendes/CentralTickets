export class PetaClient {
  private apiUrl: string
  private appToken: string
  private userToken: string

  constructor(apiUrl: string, appToken: string, userToken: string) {
    this.apiUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl
    this.appToken = appToken
    this.userToken = userToken
  }

  private buildCommonHeaders(): Record<string, string> {
    return {
      'App-Token': this.appToken,
      'Accept': 'application/json',
      'User-Agent': 'CentralTickets/1.0',
    }
  }

  private async fetchJson(method: string, path: string, headers: Record<string, string>, body?: string) {
    const res = await fetch(this.apiUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : body,
    })

    const text = await res.text()
    let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }

    return { res, text, data }
  }

  private formatError(prefix: string, res: Response, text: string) {
    const ct = res.headers.get('content-type') || ''
    const wa = res.headers.get('www-authenticate') || ''
    const server = res.headers.get('server') || ''
    const via = res.headers.get('via') || ''
    const body = text && text.trim().length ? text : '<empty body>'
    return prefix + ': ' + res.status + ' ' + res.statusText +
      ' | content-type=' + ct +
      (wa ? ' | www-authenticate=' + wa : '') +
      (server ? ' | server=' + server : '') +
      (via ? ' | via=' + via : '') +
      ' | body=' + body
  }

  async initSession(): Promise<string> {
    const common = this.buildCommonHeaders()
    const authHeaders = { ...common, Authorization: 'user_token ' + this.userToken }

    // Try GET (standard GLPI) then POST with empty JSON body.
    const first = await this.fetchJson('GET', '/initSession', authHeaders)
    if (first.res.ok && first.data && first.data.session_token) return first.data.session_token

    const second = await this.fetchJson(
      'POST',
      '/initSession',
      { ...authHeaders, 'Content-Type': 'application/json' },
      '{}'
    )
    if (second.res.ok && second.data && second.data.session_token) return second.data.session_token

    // Prefer the most informative response (POST often yields body)
    if (!second.res.ok) throw new Error(this.formatError('PETA initSession failed', second.res, second.text))
    throw new Error('PETA initSession missing session_token | body=' + (second.text || first.text || '<empty body>'))
  }

  async searchTickets(sessionToken: string, limit = 100): Promise<any[]> {
    const { res, text, data } = await this.fetchJson(
      'GET',
      '/search/Ticket?glpilist_limit=' + limit,
      { ...this.buildCommonHeaders(), 'Session-Token': sessionToken },
    )
    if (!res.ok) throw new Error(this.formatError('PETA searchTickets failed', res, text))
    return (data && data.data) ? data.data : []
  }

  async killSession(sessionToken: string): Promise<void> {
    await fetch(this.apiUrl + '/killSession', {
      method: 'GET',
      headers: { ...this.buildCommonHeaders(), 'Session-Token': sessionToken },
    })
  }
}
