// Supabase Edge Function — sync GLPI tickets to tickets_cache
// Modes:
//   Full   (reset_peta / reset_gmx = true): wipes instance data and re-syncs all pages
//   Incremental (default): fetches tickets modified in last INCREMENTAL_WINDOW_MINUTES

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GLPI_INSTANCES = {
  PETA: {
    BASE_URL:   Deno.env.get('GLPI_PETA_URL')!,
    USER_TOKEN: Deno.env.get('GLPI_PETA_USER_TOKEN')!,
    APP_TOKEN:  Deno.env.get('GLPI_PETA_APP_TOKEN')!,
  },
  GMX: {
    BASE_URL:   Deno.env.get('GLPI_GMX_URL')!,
    USER_TOKEN: Deno.env.get('GLPI_GMX_USER_TOKEN')!,
    APP_TOKEN:  Deno.env.get('GLPI_GMX_APP_TOKEN')!,
  },
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const PAGE_SIZE                  = 25
const MAX_PAGES_PER_RUN          = 8
const INCREMENTAL_WINDOW_MINUTES = 15

// GLPI search field IDs — https://glpi-project.org/fr/apidoc/
const DISPLAY_FIELDS = [1,2,3,4,5,7,8,10,12,14,15,17,18,19,20,22,80,83,151]
// 1=title  2=id  3=priority  4=urgency  5=impact  7=category  8=assigned_group
// 10=requester  12=status  14=type  15=date_creation  17=solvedate  18=closedate
// 19=date_mod  20=actiontime(s)  22=waiting_duration(s)  80=entity_completename
// 83=location  151=due_date(TTR deadline)

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function processEntity(entityFull: string, instanceName: string): string {
  if (!entityFull) return ''
  if (instanceName === 'PETA') return entityFull.replace(/^PETA\s*GRUPO\s*>\s*/gi, '').trim()
  if (instanceName === 'GMX')  return entityFull.replace(/^GMX\s*TECNOLOGIA\s*>\s*/gi, '').trim()
  return entityFull
}

function getRootCategory(cat: string): string {
  if (!cat) return 'Não categorizado'
  return cat.split(' > ')[0].trim()
}

function getStatusKey(id: number): string {
  if (id === 1) return 'new'
  if (id === 2 || id === 3) return 'processing'
  if (id === 4) return 'pending'
  if (id === 5) return 'solved'
  if (id === 6) return 'closed'
  if (id === 7) return 'pending-approval'
  return 'new'
}

function getStatusName(id: number): string {
  if (id === 1) return 'Novo'
  if (id === 2 || id === 3) return 'Em atendimento'
  if (id === 4) return 'Pendente'
  if (id === 5) return 'Solucionado'
  if (id === 6) return 'Fechado'
  if (id === 7) return 'Aprovação'
  return 'Novo'
}

function checkSlaLate(dueDate: string | null): boolean {
  return !!dueDate && new Date(dueDate) < new Date()
}

function toISOSafe(val: any): string | null {
  if (!val) return null
  try { return new Date(val).toISOString() } catch { return null }
}

// ── GLPI session ─────────────────────────────────────────────────────────────

type Instance = typeof GLPI_INSTANCES.PETA

async function initSession(inst: Instance): Promise<string> {
  const res = await fetch(`${inst.BASE_URL}/initSession`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `user_token ${inst.USER_TOKEN}`, 'App-Token': inst.APP_TOKEN },
  })
  if (!res.ok) throw new Error(`initSession ${res.status}`)
  const d = await res.json()
  return d.session_token
}

function glpiHeaders(token: string, inst: Instance) {
  return { 'Content-Type': 'application/json', 'Session-Token': token, 'App-Token': inst.APP_TOKEN }
}

// ── Build search URL ──────────────────────────────────────────────────────────

function buildSearchUrl(inst: Instance, start: number, end: number, sinceDate?: string): string {
  const p = new URLSearchParams({ range: `${start}-${end}`, expand_dropdowns: 'true', get_hateoas: 'false' })
  DISPLAY_FIELDS.forEach((id, i) => p.append(`forcedisplay[${i}]`, String(id)))
  if (sinceDate) {
    // Incremental: only tickets modified after sinceDate
    p.append('criteria[0][field]', '19')          // date_mod
    p.append('criteria[0][searchtype]', 'morethan')
    p.append('criteria[0][value]', sinceDate)
  }
  return `${inst.BASE_URL}/search/Ticket?${p.toString()}`
}

// ── Fetch pages ───────────────────────────────────────────────────────────────

async function fetchPage(url: string, inst: Instance, token: string): Promise<{ data: any[], totalcount: number }> {
  let res = await fetch(url, { headers: glpiHeaders(token, inst) })
  if (res.status === 401) {
    token = await initSession(inst)
    res = await fetch(url, { headers: glpiHeaders(token, inst) })
  }
  if (!res.ok) throw new Error(`GLPI search ${res.status}: ${(await res.text()).substring(0, 100)}`)
  const json = await res.json()
  return { data: json.data || [], totalcount: json.totalcount || 0 }
}

// ── Process raw ticket rows ───────────────────────────────────────────────────

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
    const statusId     = parseInt(r[12]) || 1
    const dueDate      = r[151] || null
    const isSlaLate    = checkSlaLate(dueDate)
    const entityFull   = r[80] || ''
    const category     = r[7] || 'Não categorizado'

    return {
      ticket_id:          parseInt(r[2]) || r.id,
      instance:           instanceName,
      title:              r[1] || 'Sem título',
      content:            '',
      entity:             processEntity(entityFull, instanceName),
      entity_full:        entityFull,
      category,
      root_category:      getRootCategory(category),
      status_id:          statusId,
      status_key:         getStatusKey(statusId),
      status_name:        getStatusName(statusId),
      group_name:         r[8] || '',
      technician:         '',
      technician_id:      0,
      requester:          r[10] || '',
      requester_id:       0,
      urgency:            parseInt(r[4]) || 3,
      impact:             parseInt(r[5]) || 3,
      priority_id:        parseInt(r[3]) || 3,
      type_id:            parseInt(r[14]) || 2,
      date_created:       toISOSafe(r[15]),
      date_mod:           toISOSafe(r[19]),
      due_date:           toISOSafe(dueDate),
      date_solved:        toISOSafe(r[17]),
      date_close:         toISOSafe(r[18]),
      resolution_duration: parseInt(r[20]) || 0,
      waiting_duration:   parseInt(r[22]) || 0,
      location:           r[83] || '',
      sla_ttr_name:       '',
      sla_tto_name:       '',
      global_validation:  1,
      is_sla_late:        isSlaLate,
      is_overdue_first:   isSlaLate,
      is_overdue_resolve: isSlaLate,
      is_deleted:         false,
      solution:           '',
    }
  })
}

// ── Fetch technicians ─────────────────────────────────────────────────────────

async function fetchTechnicians(tickets: TicketData[], inst: Instance, token: string): Promise<Map<number, { name: string, id: number }>> {
  const map = new Map<number, { name: string, id: number }>()
  const batch = 10

  for (let i = 0; i < tickets.length; i += batch) {
    const slice = tickets.slice(i, i + batch)
    const results = await Promise.all(slice.map(async t => {
      try {
        const r1 = await fetch(`${inst.BASE_URL}/Ticket/${t.ticket_id}/Ticket_User`, { headers: glpiHeaders(token, inst) })
        if (!r1.ok) return null
        const actors = await r1.json()
        if (!Array.isArray(actors)) return null
        const tech = actors.find((a: any) => a.type === 2)
        if (!tech?.users_id) return null
        const r2 = await fetch(`${inst.BASE_URL}/User/${tech.users_id}`, { headers: glpiHeaders(token, inst) })
        if (!r2.ok) return { id: tech.users_id, name: String(tech.users_id) }
        const u = await r2.json()
        const name = [u.firstname, u.realname].filter(Boolean).join(' ') || u.name || String(tech.users_id)
        return { id: tech.users_id, name }
      } catch { return null }
    }))
    results.forEach((res, idx) => { if (res) map.set(slice[idx].ticket_id, res) })
    if (i + batch < tickets.length) await new Promise(r => setTimeout(r, 100))
  }
  return map
}

// ── Fetch solutions ───────────────────────────────────────────────────────────

async function fetchSolutions(tickets: TicketData[], inst: Instance, token: string): Promise<Map<number, { solution: string, date_solved: string | null }>> {
  const map = new Map<number, { solution: string, date_solved: string | null }>()
  const solved = tickets.filter(t => t.status_key === 'solved' || t.status_key === 'closed')
  if (!solved.length) return map

  const batch = 10
  for (let i = 0; i < solved.length; i += batch) {
    const slice = solved.slice(i, i + batch)
    const results = await Promise.all(slice.map(async t => {
      try {
        const r = await fetch(`${inst.BASE_URL}/Ticket/${t.ticket_id}/ITILSolution`, { headers: glpiHeaders(token, inst) })
        if (!r.ok) return null
        const data = await r.json()
        if (!Array.isArray(data) || !data.length) return null
        const last = data[data.length - 1]
        return { ticketId: t.ticket_id, solution: stripHtml(last.content || ''), date_solved: toISOSafe(last.date_creation) }
      } catch { return null }
    }))
    results.forEach(res => { if (res) map.set(res.ticketId, { solution: res.solution, date_solved: res.date_solved }) })
    if (i + batch < solved.length) await new Promise(r => setTimeout(r, 100))
  }
  return map
}

// ── Upsert batch ──────────────────────────────────────────────────────────────

async function upsertBatch(tickets: TicketData[]): Promise<void> {
  const BATCH = 100
  for (let i = 0; i < tickets.length; i += BATCH) {
    const slice = tickets.slice(i, i + BATCH)
    const { error } = await supabase.from('tickets_cache').upsert(
      slice.map(t => ({
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
        date_solved: t.date_solved || null, date_close: t.date_close,
        resolution_duration: t.resolution_duration, waiting_duration: t.waiting_duration,
        location: t.location, sla_ttr_name: t.sla_ttr_name, sla_tto_name: t.sla_tto_name,
        global_validation: t.global_validation,
        is_sla_late: t.is_sla_late, is_overdue_first: t.is_overdue_first, is_overdue_resolve: t.is_overdue_resolve,
        is_deleted: t.is_deleted, solution: t.solution || null,
        last_sync: new Date().toISOString(), updated_at: new Date().toISOString(),
      })),
      { onConflict: 'ticket_id,instance' }
    )
    if (error) console.error(`Upsert error batch ${i}:`, error.message)
  }
}

// ── Sync instance ─────────────────────────────────────────────────────────────

interface SyncResult { success: boolean; count: number; mode: string; error?: string; completed?: boolean; lastPage?: number; totalPages?: number }

async function syncInstance(instanceName: 'PETA' | 'GMX', mode: 'full' | 'incremental'): Promise<SyncResult> {
  const inst = GLPI_INSTANCES[instanceName]
  console.log(`[${instanceName}] Starting ${mode} sync`)

  try {
    // Get sync control state
    const { data: ctrl } = await supabase.from('sync_control').select('*').eq('instance', instanceName).single()

    let token = await initSession(inst)
    let allTickets: TicketData[] = []
    let completed = true
    let lastPage = 0
    let totalPages = 0

    if (mode === 'full') {
      // --- Full sync: paginate from scratch ---
      const startPage = (ctrl?.last_page && ctrl?.status !== 'success') ? (ctrl.last_page || 0) : 0
      if (startPage === 0) {
        // Fresh start: clear existing data
        console.log(`[${instanceName}] Clearing existing data...`)
        await supabase.from('tickets_cache').delete().eq('instance', instanceName)
        await supabase.from('sync_control').delete().eq('instance', instanceName)
      }

      let page = startPage
      const endPage = startPage + MAX_PAGES_PER_RUN

      while (page < endPage) {
        const start = page * PAGE_SIZE
        const end   = start + PAGE_SIZE - 1
        const url   = buildSearchUrl(inst, start, end)

        const { data, totalcount } = await fetchPage(url, inst, token)
        if (page === startPage) {
          totalPages = Math.ceil(totalcount / PAGE_SIZE)
          console.log(`[${instanceName}] Total: ${totalcount} tickets / ${totalPages} pages`)
        }
        if (!data.length) break

        allTickets.push(...processTickets(data, instanceName))
        page++
        lastPage = page

        if (data.length < PAGE_SIZE || page >= totalPages) break
      }

      completed = lastPage >= totalPages

    } else {
      // --- Incremental: only recently modified tickets ---
      const lastSync = ctrl?.last_sync ? new Date(ctrl.last_sync) : new Date(Date.now() - INCREMENTAL_WINDOW_MINUTES * 60000)
      const sinceDate = new Date(lastSync.getTime() - INCREMENTAL_WINDOW_MINUTES * 60000)
        .toISOString().replace('T', ' ').substring(0, 19)

      console.log(`[${instanceName}] Incremental since: ${sinceDate}`)

      let page = 0
      while (true) {
        const start = page * PAGE_SIZE
        const end   = start + PAGE_SIZE - 1
        const url   = buildSearchUrl(inst, start, end, sinceDate)
        const { data, totalcount } = await fetchPage(url, inst, token)

        if (page === 0) {
          totalPages = Math.ceil(totalcount / PAGE_SIZE)
          console.log(`[${instanceName}] Incremental: ${totalcount} changed tickets`)
        }
        if (!data.length) break
        allTickets.push(...processTickets(data, instanceName))
        page++
        if (data.length < PAGE_SIZE || page >= totalPages) break
      }
      completed = true
    }

    // Fetch technicians
    if (allTickets.length > 0) {
      console.log(`[${instanceName}] Fetching technicians for ${allTickets.length} tickets...`)
      const techMap = await fetchTechnicians(allTickets, inst, token)
      allTickets.forEach(t => {
        const tech = techMap.get(t.ticket_id)
        if (tech) { t.technician = tech.name; t.technician_id = tech.id }
      })
    }

    // Fetch solutions for solved/closed
    if (allTickets.length > 0) {
      console.log(`[${instanceName}] Fetching solutions...`)
      const solMap = await fetchSolutions(allTickets, inst, token)
      allTickets.forEach(t => {
        const sol = solMap.get(t.ticket_id)
        if (sol) { t.solution = sol.solution; if (sol.date_solved) t.date_solved = sol.date_solved }
      })
    }

    // Upsert
    if (allTickets.length > 0) {
      console.log(`[${instanceName}] Upserting ${allTickets.length} tickets...`)
      await upsertBatch(allTickets)
    }

    // Update sync_control
    await supabase.from('sync_control').upsert({
      instance: instanceName,
      last_sync: new Date().toISOString(),
      status: completed ? 'success' : 'in_progress',
      last_page: completed ? 0 : lastPage,
      total_pages: totalPages,
      tickets_count: allTickets.length,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'instance' })

    console.log(`[${instanceName}] Done. ${allTickets.length} tickets, completed=${completed}`)
    return { success: true, count: allTickets.length, mode, completed, lastPage, totalPages }

  } catch (err: any) {
    console.error(`[${instanceName}] Error:`, err.message)
    await supabase.from('sync_control').upsert({
      instance: instanceName, status: 'failed', error_message: err.message, updated_at: new Date().toISOString(),
    }, { onConflict: 'instance' })
    return { success: false, count: 0, mode, error: err.message }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const start = Date.now()
  const body  = await req.json().catch(() => ({}))
  const { reset_peta, reset_gmx, instance, mode } = body

  try {
    let petaResult: SyncResult = { success: true, count: 0, mode: 'skipped', completed: true }
    let gmxResult:  SyncResult = { success: true, count: 0, mode: 'skipped', completed: true }

    const petaMode: 'full' | 'incremental' = (reset_peta || mode === 'full') ? 'full' : 'incremental'
    const gmxMode:  'full' | 'incremental' = (reset_gmx  || mode === 'full') ? 'full' : 'incremental'

    if (!instance || instance === 'PETA') petaResult = await syncInstance('PETA', petaMode)
    if (!instance || instance === 'GMX')  gmxResult  = await syncInstance('GMX',  gmxMode)

    const anyFailed  = !petaResult.success || !gmxResult.success
    const allDone    = (petaResult.completed ?? true) && (gmxResult.completed ?? true)
    const totalCount = petaResult.count + gmxResult.count

    await supabase.from('sync_logs').insert({
      instance: 'ALL', finished_at: new Date().toISOString(),
      status: anyFailed ? 'failed' : allDone ? 'success' : 'partial',
      tickets_processed: totalCount,
      error_message: petaResult.error || gmxResult.error || null,
    })

    return new Response(JSON.stringify({
      success: !anyFailed, duration_ms: Date.now() - start,
      results: { peta: petaResult, gmx: gmxResult },
      needsResume: !allDone,
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
