// Supabase Edge Function — sync GLPI tickets to tickets_cache
// Executa via cron job (pg_net) — auto-bootstrap na primeira execução
//
// Modos:
//   full        — limpa instância e varre todos os tickets do zero
//   incremental — busca tickets modificados nos últimos INCREMENTAL_WINDOW_MINUTES
//
// Auto-bootstrap: quando não há registro em sync_control (ou status='pending')
// a função inicia full sync automaticamente, sem parâmetros extras.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Configuração ──────────────────────────────────────────────────────────────

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')              ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const INSTANCES = {
  PETA: {
    BASE_URL:   Deno.env.get('GLPI_PETA_URL')        ?? '',
    USER_TOKEN: Deno.env.get('GLPI_PETA_USER_TOKEN') ?? '',
    APP_TOKEN:  Deno.env.get('GLPI_PETA_APP_TOKEN')  ?? '',
  },
  GMX: {
    BASE_URL:   Deno.env.get('GLPI_GMX_URL')        ?? '',
    USER_TOKEN: Deno.env.get('GLPI_GMX_USER_TOKEN') ?? '',
    APP_TOKEN:  Deno.env.get('GLPI_GMX_APP_TOKEN')  ?? '',
  },
}

const PAGE_SIZE                  = 25
const MAX_PAGES_PER_RUN          = 8
const INCREMENTAL_WINDOW_MINUTES = 15

// GLPI search field IDs
const DISPLAY_FIELDS = [1,2,3,4,5,7,8,10,12,14,15,17,18,19,20,22,80,83,151]
// 1=título  2=id  3=prioridade  4=urgência  5=impacto  7=categoria  8=grupo
// 10=solicitante  12=status  14=tipo  15=data_criação  17=data_solução
// 18=data_fechamento  19=data_mod  20=tempo_resolução(s)  22=tempo_espera(s)
// 80=entidade_completa  83=localização  151=data_prazo

// ── Normalização PETA/GMX ─────────────────────────────────────────────────────
// Remove prefixos do nome da instância de entidades, grupos, locais e categorias
// Handles: "PETA GRUPO > X", "PETA > X", "PETA - X", "PETA X", e variações GMX

const STRIP_PREFIXES: Record<string, RegExp[]> = {
  PETA: [
    /^peta\s+grupo\s*[>\\/|]\s*/i,   // "PETA GRUPO > ..."
    /^peta\s+grupo\s+/i,              // "PETA GRUPO ..."
    /^peta\s*[>\\/|]\s*/i,            // "PETA > ..."
    /^peta\s*[-–—]\s*/i,              // "PETA - ..."
    /^peta\s+/i,                       // "PETA ..." (fallback)
  ],
  GMX: [
    /^gmx\s+tecnologia\s*[>\\/|]\s*/i,  // "GMX TECNOLOGIA > ..."
    /^gmx\s+tecnologia\s+/i,             // "GMX TECNOLOGIA ..."
    /^gmx\s*[>\\/|]\s*/i,               // "GMX > ..."
    /^gmx\s*[-–—]\s*/i,                 // "GMX - ..."
    /^gmx\s+/i,                          // "GMX ..." (fallback)
  ],
}

function normInst(str: string, inst: string): string {
  if (!str) return ''
  const pats = STRIP_PREFIXES[inst] ?? []
  const s    = str.trim()
  for (const p of pats) {
    const r = s.replace(p, '').trim()
    if (r !== s) return r
  }
  return s
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function getStatusKey(id: number): string {
  const m: Record<number, string> = {
    1: 'new', 2: 'processing', 3: 'processing',
    4: 'pending', 5: 'solved', 6: 'closed', 7: 'pending-approval',
  }
  return m[id] ?? 'new'
}

function getStatusName(id: number): string {
  const m: Record<number, string> = {
    1: 'Novo', 2: 'Em atendimento', 3: 'Em atendimento',
    4: 'Pendente', 5: 'Solucionado', 6: 'Fechado', 7: 'Aprovação',
  }
  return m[id] ?? 'Novo'
}

function checkSlaLate(dueDate: string | null): boolean {
  return !!dueDate && new Date(dueDate) < new Date()
}

function toISO(val: unknown): string | null {
  if (!val) return null
  try { return new Date(String(val)).toISOString() } catch { return null }
}

function rootCat(cat: string): string {
  return cat ? cat.split(' > ')[0].trim() : 'Não categorizado'
}

// ── Sessão GLPI ───────────────────────────────────────────────────────────────

type Inst = typeof INSTANCES.PETA

async function initSession(inst: Inst): Promise<string> {
  if (!inst.BASE_URL) throw new Error('GLPI BASE_URL não configurado (variável de ambiente ausente)')
  const res = await fetch(`${inst.BASE_URL}/initSession`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `user_token ${inst.USER_TOKEN}`,
      'App-Token': inst.APP_TOKEN,
    },
  })
  if (!res.ok) throw new Error(`initSession HTTP ${res.status}: ${await res.text()}`)
  const d = await res.json()
  if (!d.session_token) throw new Error('initSession: session_token ausente na resposta')
  return d.session_token
}

function glpiHeaders(token: string, inst: Inst) {
  return { 'Content-Type': 'application/json', 'Session-Token': token, 'App-Token': inst.APP_TOKEN }
}

// ── URL de busca ──────────────────────────────────────────────────────────────

function buildSearchUrl(inst: Inst, start: number, end: number, sinceDate?: string): string {
  const p = new URLSearchParams({ range: `${start}-${end}`, expand_dropdowns: 'true', get_hateoas: 'false' })
  DISPLAY_FIELDS.forEach((id, i) => p.append(`forcedisplay[${i}]`, String(id)))
  if (sinceDate) {
    p.append('criteria[0][field]', '19')
    p.append('criteria[0][searchtype]', 'morethan')
    p.append('criteria[0][value]', sinceDate)
  }
  return `${inst.BASE_URL}/search/Ticket?${p.toString()}`
}

// ── Fetch de página — propaga token atualizado após re-auth ───────────────────

async function fetchPage(
  url: string, inst: Inst, token: string
): Promise<{ data: any[], totalcount: number, token: string }> {
  let res = await fetch(url, { headers: glpiHeaders(token, inst) })
  if (res.status === 401) {
    token = await initSession(inst)
    res   = await fetch(url, { headers: glpiHeaders(token, inst) })
  }
  if (!res.ok) throw new Error(`GLPI search HTTP ${res.status}: ${(await res.text()).substring(0, 200)}`)
  const json = await res.json()
  return { data: json.data ?? [], totalcount: json.totalcount ?? 0, token }
}

// ── Processar tickets brutos ──────────────────────────────────────────────────

interface TicketData {
  ticket_id: number; instance: string; title: string; content: string
  entity: string; entity_full: string; category: string; root_category: string
  status_id: number; status_key: string; status_name: string
  group_name: string; technician: string; technician_id: number
  requester: string; requester_id: number
  urgency: number; impact: number; priority_id: number; type_id: number
  date_created: string | null; date_mod: string | null; due_date: string | null
  date_solved: string | null; date_close: string | null
  resolution_duration: number; waiting_duration: number; location: string
  sla_ttr_name: string; sla_tto_name: string; global_validation: number
  is_sla_late: boolean; is_overdue_first: boolean; is_overdue_resolve: boolean
  is_deleted: boolean; solution: string
}

function processTickets(rows: any[], instanceName: string): TicketData[] {
  return rows.map(r => {
    const statusId  = parseInt(r[12]) || 1
    const dueDate   = r[151] || null
    const isSlaLate = checkSlaLate(dueDate)
    const rawEntity = r[80] || ''
    const rawGroup  = r[8]  || ''
    const rawLoc    = r[83] || ''
    const category  = normInst(r[7] || '', instanceName) || 'Não categorizado'

    return {
      ticket_id:           parseInt(r[2]) || r.id,
      instance:            instanceName,
      title:               r[1] || 'Sem título',
      content:             '',
      entity:              normInst(rawEntity, instanceName),
      entity_full:         rawEntity,
      category,
      root_category:       rootCat(category),
      status_id:           statusId,
      status_key:          getStatusKey(statusId),
      status_name:         getStatusName(statusId),
      group_name:          normInst(rawGroup, instanceName),
      technician:          '',
      technician_id:       0,
      requester:           r[10] || '',
      requester_id:        0,
      urgency:             parseInt(r[4]) || 3,
      impact:              parseInt(r[5]) || 3,
      priority_id:         parseInt(r[3]) || 3,
      type_id:             parseInt(r[14]) || 2,
      date_created:        toISO(r[15]),
      date_mod:            toISO(r[19]),
      due_date:            toISO(dueDate),
      date_solved:         toISO(r[17]),
      date_close:          toISO(r[18]),
      resolution_duration: parseInt(r[20]) || 0,
      waiting_duration:    parseInt(r[22]) || 0,
      location:            normInst(rawLoc, instanceName),
      sla_ttr_name:        '',
      sla_tto_name:        '',
      global_validation:   1,
      is_sla_late:         isSlaLate,
      is_overdue_first:    isSlaLate,
      is_overdue_resolve:  isSlaLate,
      is_deleted:          false,
      solution:            '',
    }
  })
}

// ── Buscar técnicos ───────────────────────────────────────────────────────────

async function fetchTechnicians(
  tickets: TicketData[], inst: Inst, token: string
): Promise<Map<number, { name: string, id: number }>> {
  const map   = new Map<number, { name: string, id: number }>()
  const BATCH = 10

  for (let i = 0; i < tickets.length; i += BATCH) {
    const slice   = tickets.slice(i, i + BATCH)
    const results = await Promise.all(slice.map(async t => {
      try {
        let r1 = await fetch(`${inst.BASE_URL}/Ticket/${t.ticket_id}/Ticket_User`, { headers: glpiHeaders(token, inst) })
        if (r1.status === 401) {
          token = await initSession(inst)
          r1    = await fetch(`${inst.BASE_URL}/Ticket/${t.ticket_id}/Ticket_User`, { headers: glpiHeaders(token, inst) })
        }
        if (!r1.ok) return null
        const actors = await r1.json()
        if (!Array.isArray(actors)) return null
        const tech = actors.find((a: any) => a.type === 2)
        if (!tech?.users_id) return null
        const r2 = await fetch(`${inst.BASE_URL}/User/${tech.users_id}`, { headers: glpiHeaders(token, inst) })
        if (!r2.ok) return { id: tech.users_id, name: String(tech.users_id) }
        const u    = await r2.json()
        const name = [u.firstname, u.realname].filter(Boolean).join(' ') || u.name || String(tech.users_id)
        return { id: tech.users_id, name }
      } catch { return null }
    }))
    results.forEach((res, idx) => { if (res) map.set(slice[idx].ticket_id, res) })
    if (i + BATCH < tickets.length) await new Promise(r => setTimeout(r, 100))
  }
  return map
}

// ── Buscar soluções ───────────────────────────────────────────────────────────

async function fetchSolutions(
  tickets: TicketData[], inst: Inst, token: string
): Promise<Map<number, { solution: string, date_solved: string | null }>> {
  const map    = new Map<number, { solution: string, date_solved: string | null }>()
  const solved = tickets.filter(t => t.status_key === 'solved' || t.status_key === 'closed')
  if (!solved.length) return map

  const BATCH = 10
  for (let i = 0; i < solved.length; i += BATCH) {
    const slice   = solved.slice(i, i + BATCH)
    const results = await Promise.all(slice.map(async t => {
      try {
        let r = await fetch(`${inst.BASE_URL}/Ticket/${t.ticket_id}/ITILSolution`, { headers: glpiHeaders(token, inst) })
        if (r.status === 401) {
          token = await initSession(inst)
          r     = await fetch(`${inst.BASE_URL}/Ticket/${t.ticket_id}/ITILSolution`, { headers: glpiHeaders(token, inst) })
        }
        if (!r.ok) return null
        const data = await r.json()
        if (!Array.isArray(data) || !data.length) return null
        const last = data[data.length - 1]
        return { ticketId: t.ticket_id, solution: stripHtml(last.content ?? ''), date_solved: toISO(last.date_creation) }
      } catch { return null }
    }))
    results.forEach(res => { if (res) map.set(res.ticketId, { solution: res.solution, date_solved: res.date_solved }) })
    if (i + BATCH < solved.length) await new Promise(r => setTimeout(r, 100))
  }
  return map
}

// ── Upsert em lote ────────────────────────────────────────────────────────────

async function upsertBatch(tickets: TicketData[]): Promise<void> {
  const BATCH = 100
  for (let i = 0; i < tickets.length; i += BATCH) {
    const { error } = await supabase.from('tickets_cache').upsert(
      tickets.slice(i, i + BATCH).map(t => ({
        ticket_id: t.ticket_id, instance: t.instance,
        title: t.title, content: t.content,
        entity: t.entity, entity_full: t.entity_full,
        category: t.category, root_category: t.root_category,
        status_id: t.status_id, status_key: t.status_key, status_name: t.status_name,
        group_name: t.group_name,
        technician: t.technician, technician_id: t.technician_id,
        requester: t.requester, requester_id: t.requester_id,
        urgency: t.urgency, impact: t.impact, priority_id: t.priority_id, type_id: t.type_id,
        date_created: t.date_created, date_mod: t.date_mod, due_date: t.due_date,
        date_solved: t.date_solved, date_close: t.date_close,
        resolution_duration: t.resolution_duration, waiting_duration: t.waiting_duration,
        location: t.location, sla_ttr_name: t.sla_ttr_name, sla_tto_name: t.sla_tto_name,
        global_validation: t.global_validation,
        is_sla_late: t.is_sla_late, is_overdue_first: t.is_overdue_first, is_overdue_resolve: t.is_overdue_resolve,
        is_deleted: t.is_deleted, solution: t.solution || null,
        last_sync: new Date().toISOString(), updated_at: new Date().toISOString(),
      })),
      { onConflict: 'ticket_id,instance' }
    )
    if (error) console.error(`[upsert] batch ${i}:`, error.message)
  }
}

// ── Sincronizar instância ─────────────────────────────────────────────────────

interface SyncResult {
  success: boolean; count: number; mode: string
  error?: string; completed?: boolean; lastPage?: number; totalPages?: number
}

async function syncInstance(instanceName: 'PETA' | 'GMX', mode: 'full' | 'incremental'): Promise<SyncResult> {
  const inst = INSTANCES[instanceName]
  console.log(`[${instanceName}] iniciando modo=${mode}`)

  try {
    const { data: ctrl } = await supabase
      .from('sync_control').select('*').eq('instance', instanceName).maybeSingle()

    let token      = await initSession(inst)
    let allTickets: TicketData[] = []
    let completed  = true
    let lastPage   = 0
    let totalPages = 0

    if (mode === 'full') {
      // Retoma onde parou se estava 'in_progress'; senão começa do zero
      const startPage = (ctrl?.status === 'in_progress' && (ctrl?.last_page ?? 0) > 0)
        ? (ctrl.last_page as number)
        : 0

      if (startPage === 0) {
        console.log(`[${instanceName}] limpando dados existentes`)
        await supabase.from('tickets_cache').delete().eq('instance', instanceName)
        await supabase.from('sync_control').delete().eq('instance', instanceName)
      } else {
        console.log(`[${instanceName}] retomando da página ${startPage}`)
      }

      let page    = startPage
      const limit = startPage + MAX_PAGES_PER_RUN

      while (page < limit) {
        const url    = buildSearchUrl(inst, page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
        const result = await fetchPage(url, inst, token)
        token = result.token

        if (page === startPage) {
          totalPages = Math.ceil(result.totalcount / PAGE_SIZE)
          console.log(`[${instanceName}] total: ${result.totalcount} tickets (${totalPages} páginas)`)
        }
        if (!result.data.length) break

        allTickets.push(...processTickets(result.data, instanceName))
        page++; lastPage = page
        if (result.data.length < PAGE_SIZE || page >= totalPages) break
      }

      completed = lastPage >= totalPages

    } else {
      const lastSync  = ctrl?.last_sync
        ? new Date(ctrl.last_sync)
        : new Date(Date.now() - INCREMENTAL_WINDOW_MINUTES * 60000)
      const sinceDate = new Date(lastSync.getTime() - INCREMENTAL_WINDOW_MINUTES * 60000)
        .toISOString().replace('T', ' ').substring(0, 19)

      console.log(`[${instanceName}] incremental desde: ${sinceDate}`)

      let page = 0
      while (true) {
        const url    = buildSearchUrl(inst, page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1, sinceDate)
        const result = await fetchPage(url, inst, token)
        token = result.token

        if (page === 0) {
          totalPages = Math.ceil(result.totalcount / PAGE_SIZE)
          console.log(`[${instanceName}] incremental: ${result.totalcount} tickets alterados`)
        }
        if (!result.data.length) break
        allTickets.push(...processTickets(result.data, instanceName))
        page++
        if (result.data.length < PAGE_SIZE || page >= totalPages) break
      }
    }

    if (allTickets.length > 0) {
      console.log(`[${instanceName}] buscando técnicos para ${allTickets.length} tickets`)
      const techMap = await fetchTechnicians(allTickets, inst, token)
      allTickets.forEach(t => {
        const tech = techMap.get(t.ticket_id)
        if (tech) { t.technician = tech.name; t.technician_id = tech.id }
      })

      console.log(`[${instanceName}] buscando soluções`)
      const solMap = await fetchSolutions(allTickets, inst, token)
      allTickets.forEach(t => {
        const sol = solMap.get(t.ticket_id)
        if (sol) { t.solution = sol.solution; if (sol.date_solved) t.date_solved = sol.date_solved }
      })

      console.log(`[${instanceName}] salvando ${allTickets.length} tickets`)
      await upsertBatch(allTickets)
    } else {
      console.log(`[${instanceName}] nenhum ticket para salvar`)
    }

    await supabase.from('sync_control').upsert({
      instance:      instanceName,
      last_sync:     new Date().toISOString(),
      status:        completed ? 'success' : 'in_progress',
      last_page:     completed ? 0 : lastPage,
      total_pages:   totalPages,
      tickets_count: allTickets.length,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'instance' }).catch(e => console.warn(`[${instanceName}] sync_control:`, e.message))

    console.log(`[${instanceName}] concluído: ${allTickets.length} tickets, completed=${completed}`)
    return { success: true, count: allTickets.length, mode, completed, lastPage, totalPages }

  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error(`[${instanceName}] erro:`, msg)
    await supabase.from('sync_control').upsert({
      instance: instanceName, status: 'failed',
      error_message: msg, updated_at: new Date().toISOString(),
    }, { onConflict: 'instance' }).catch(() => {})
    return { success: false, count: 0, mode, error: msg }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const start   = Date.now()
  const respond = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  try {
    const body = await req.json().catch(() => ({})) as any
    const { reset_peta = false, reset_gmx = false, instance, mode } = body

    // Lê estado atual — maybeSingle() é seguro mesmo se a tabela não existir
    const [petaRes, gmxRes] = await Promise.all([
      supabase.from('sync_control').select('status,last_page').eq('instance', 'PETA').maybeSingle(),
      supabase.from('sync_control').select('status,last_page').eq('instance', 'GMX').maybeSingle(),
    ])
    const petaCtrl = petaRes.data
    const gmxCtrl  = gmxRes.data

    // Auto-bootstrap: full sync quando não há registro, status=pending ou in_progress
    const needsFull = (ctrl: any) => !ctrl || ctrl.status === 'pending' || ctrl.status === 'in_progress'

    const petaMode: 'full' | 'incremental' =
      (reset_peta || mode === 'full' || needsFull(petaCtrl)) ? 'full' : 'incremental'
    const gmxMode: 'full' | 'incremental' =
      (reset_gmx  || mode === 'full' || needsFull(gmxCtrl))  ? 'full' : 'incremental'

    console.log(`[entry] petaMode=${petaMode}(${petaCtrl?.status ?? 'sem registro'}) gmxMode=${gmxMode}(${gmxCtrl?.status ?? 'sem registro'})`)

    const skip = (n: string): SyncResult => ({ success: true, count: 0, mode: `skipped:${n}`, completed: true })

    // Roda PETA e GMX em paralelo para ficar dentro do timeout de 150s
    const [petaResult, gmxResult] = await Promise.all([
      (!instance || instance === 'PETA') ? syncInstance('PETA', petaMode) : Promise.resolve(skip('PETA')),
      (!instance || instance === 'GMX')  ? syncInstance('GMX',  gmxMode)  : Promise.resolve(skip('GMX')),
    ])

    const anyFailed = !petaResult.success || !gmxResult.success
    const allDone   = (petaResult.completed ?? true) && (gmxResult.completed ?? true)

    await supabase.from('sync_logs').insert({
      instance:          'ALL',
      finished_at:       new Date().toISOString(),
      status:            anyFailed ? 'failed' : allDone ? 'success' : 'partial',
      tickets_processed: petaResult.count + gmxResult.count,
      error_message:     petaResult.error ?? gmxResult.error ?? null,
    }).catch(e => console.warn('sync_logs (não-fatal):', e.message))

    return respond({
      success:     !anyFailed,
      duration_ms: Date.now() - start,
      results:     { peta: petaResult, gmx: gmxResult },
      needsResume: !allDone,
    })

  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error('[entry] erro não tratado:', msg)
    // Sempre retorna 200 com success=false — nunca deixa escapar como 500
    return respond({ success: false, error: msg, duration_ms: Date.now() - start })
  }
})
