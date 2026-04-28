import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')              ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const INST_NAME = 'GMX' as const
const INST = {
  BASE_URL:   Deno.env.get('GLPI_GMX_URL')        ?? '',
  USER_TOKEN: Deno.env.get('GLPI_GMX_USER_TOKEN') ?? '',
  APP_TOKEN:  Deno.env.get('GLPI_GMX_APP_TOKEN')  ?? '',
}

const MAX_PAGES_SWEEP       = 100
const MAX_PAGES_INCREMENTAL = 8
const INCREMENTAL_WINDOW    = 15
const BACKFILL_TECH         = 100
const BACKFILL_SOL          = 50

const DISPLAY_FIELDS = [1,2,3,4,5,7,8,10,12,13,14,15,17,18,19,20,22,55,80,83,151]

const STRIP = [
  /^gmx\s+tecnologia\s*[>\\/|]\s*/i,
  /^gmx\s+tecnologia\s+/i,
  /^gmx\s*[>\\/|]\s*/i,
  /^gmx\s*[-ÔÇôÔÇö]\s*/i,
  /^gmx\s+/i,
]

function glpiStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return String(o.completename ?? o.name ?? o.id ?? '')
  }
  return String(v)
}

function norm(v: unknown): string {
  const s = glpiStr(v)
  if (!s) return ''
  const t = s.trim()
  for (const p of STRIP) {
    const r = t.replace(p, '').trim()
    if (r !== t) return r
  }
  return t
}

function stripHtml(h: string): string {
  return (h || '').replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function statusKey(id: number, gv: number): string {
  if (gv === 2 && id !== 5 && id !== 6) return 'pending-approval'
  if (id === 1) return 'new'
  if (id === 2 || id === 3) return 'processing'
  if (id === 4) return 'pending'
  if (id === 5) return 'solved'
  if (id === 6) return 'closed'
  return 'new'
}

function statusName(id: number, gv: number): string {
  if (gv === 2 && id !== 5 && id !== 6) return 'Aprova├º├úo'
  if (id === 1) return 'Novo'
  if (id === 2 || id === 3) return 'Em atendimento'
  if (id === 4) return 'Pendente'
  if (id === 5) return 'Solucionado'
  if (id === 6) return 'Fechado'
  return 'Novo'
}

function slaLate(d: string | null): boolean { return !!d && new Date(d) < new Date() }
function toISO(v: unknown): string | null {
  if (!v) return null
  try { return new Date(String(v)).toISOString() } catch { return null }
}
function rootCat(c: string): string { return c ? c.split(' > ')[0].trim() : 'N├úo categorizado' }

async function isCacheEmpty(): Promise<boolean> {
  const { count, error } = await supabase
    .from('tickets_cache').select('*', { count: 'exact', head: true }).eq('instance', INST_NAME)
  if (error) { console.warn('[isCacheEmpty]', error.message); return false }
  return count === 0
}

async function initSession(): Promise<string> {
  if (!INST.BASE_URL) throw new Error('GLPI_GMX_URL n├úo configurado')
  const r = await fetch(`${INST.BASE_URL}/initSession`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `user_token ${INST.USER_TOKEN}`, 'App-Token': INST.APP_TOKEN },
  })
  if (!r.ok) throw new Error(`initSession ${r.status}: ${await r.text()}`)
  const d = await r.json()
  if (!d.session_token) throw new Error('initSession: sem session_token')
  return d.session_token
}

function hdrs(token: string) {
  return { 'Content-Type': 'application/json', 'Session-Token': token, 'App-Token': INST.APP_TOKEN }
}

function searchUrl(start: number, end: number, since?: string): string {
  const p = new URLSearchParams({ range: `${start}-${end}`, expand_dropdowns: 'true', get_hateoas: 'false' })
  DISPLAY_FIELDS.forEach((id, i) => p.append(`forcedisplay[${i}]`, String(id)))
  if (since) {
    p.append('criteria[0][field]', '19')
    p.append('criteria[0][searchtype]', 'morethan')
    p.append('criteria[0][value]', since)
  }
  return `${INST.BASE_URL}/search/Ticket?${p}`
}

async function fetchPage(url: string, token: string) {
  let r = await fetch(url, { headers: hdrs(token) })
  if (r.status === 401) { token = await initSession(); r = await fetch(url, { headers: hdrs(token) }) }
  if (r.status === 429) {
    console.warn('[fetchPage] rate limit 429, aguardando 3s')
    await new Promise(res => setTimeout(res, 3000))
    r = await fetch(url, { headers: hdrs(token) })
  }
  if (!r.ok) throw new Error(`GLPI ${r.status}: ${(await r.text()).substring(0, 200)}`)
  const j = await r.json()
  return { data: j.data ?? [], total: j.totalcount ?? 0, token }
}

interface TD {
  ticket_id: number; instance: string; title: string
  entity: string; entity_full: string; category: string; root_category: string
  status_id: number; status_key: string; status_name: string
  group_name: string; technician: string; technician_id: number
  requester: string; requester_id: number
  urgency: number; impact: number; priority_id: number; type_id: number
  global_validation: number
  date_created: string|null; date_mod: string|null; due_date: string|null
  date_solved: string|null; date_close: string|null
  resolution_duration: number; waiting_duration: number; location: string
  sla_ttr_name: string; sla_tto_name: string
  is_sla_late: boolean; is_overdue_first: boolean; is_overdue_resolve: boolean
  is_deleted: boolean; solution: string; request_source: string
}

function processRows(rows: any[]): TD[] {
  return rows.flatMap(r => {
    const tid = parseInt(r[2]) || parseInt(r.id) || 0
    if (!tid) return []
    const sid = parseInt(r[12]) || 1
    const gv  = parseInt(r[55]) || 1
    const due = r[151] || null
    const late = slaLate(due)
    const cat = norm(r[7] || '') || 'N├úo categorizado'
    return [{
      ticket_id:           tid,
      instance:            INST_NAME,
      title:               glpiStr(r[1]) || 'Sem t├¡tulo',
      entity:              norm(r[80] || ''),
      entity_full:         r[80] || '',
      category:            cat,
      root_category:       rootCat(cat),
      status_id:           sid,
      status_key:          statusKey(sid, gv),
      status_name:         statusName(sid, gv),
      group_name:          norm(r[8] || ''),
      technician:          '', technician_id: 0,
      requester:           glpiStr(r[10]), requester_id: 0,
      urgency:             parseInt(r[4]) || 3,
      impact:              parseInt(r[5]) || 3,
      priority_id:         parseInt(r[3]) || 3,
      type_id:             parseInt(r[14]) || 2,
      request_source:      glpiStr(r[13]),
      global_validation:   gv,
      date_created:        toISO(r[15]),
      date_mod:            toISO(r[19]),
      due_date:            toISO(due),
      date_solved:         toISO(r[17]),
      date_close:          toISO(r[18]),
      resolution_duration: parseInt(r[20]) || 0,
      waiting_duration:    parseInt(r[22]) || 0,
      location:            norm(r[83] || ''),
      sla_ttr_name: '', sla_tto_name: '',
      is_sla_late: late, is_overdue_first: late, is_overdue_resolve: late,
      is_deleted: false, solution: '',
    }]
  })
}

async function fetchTechs(tickets: TD[], token: string): Promise<Map<number,{name:string,id:number}>> {
  const map = new Map<number,{name:string,id:number}>()
  for (let i = 0; i < tickets.length; i += 5) {
    const sl = tickets.slice(i, i + 5)
    const rs = await Promise.all(sl.map(async t => {
      try {
        let r1 = await fetch(`${INST.BASE_URL}/Ticket/${t.ticket_id}/Ticket_User`, { headers: hdrs(token) })
        if (r1.status === 401) { token = await initSession(); r1 = await fetch(`${INST.BASE_URL}/Ticket/${t.ticket_id}/Ticket_User`, { headers: hdrs(token) }) }
        if (!r1.ok) return null
        const actors = await r1.json()
        if (!Array.isArray(actors)) return null
        const tech = actors.find((a: any) => a.type === 2)
        if (!tech?.users_id) return null
        const r2 = await fetch(`${INST.BASE_URL}/User/${tech.users_id}`, { headers: hdrs(token) })
        if (!r2.ok) return { id: tech.users_id, name: String(tech.users_id) }
        const u = await r2.json()
        return { id: tech.users_id, name: [u.firstname, u.realname].filter(Boolean).join(' ') || u.name || String(tech.users_id) }
      } catch { return null }
    }))
    rs.forEach((res, idx) => { if (res) map.set(sl[idx].ticket_id, res) })
    if (i + 5 < tickets.length) await new Promise(r => setTimeout(r, 300))
  }
  return map
}

async function fetchSols(tickets: TD[], token: string): Promise<Map<number,{solution:string,date_solved:string|null}>> {
  const map = new Map<number,{solution:string,date_solved:string|null}>()
  const solved = tickets.filter(t => t.status_key === 'solved' || t.status_key === 'closed')
  if (!solved.length) return map
  for (let i = 0; i < solved.length; i += 5) {
    const sl = solved.slice(i, i + 5)
    const rs = await Promise.all(sl.map(async t => {
      try {
        let r = await fetch(`${INST.BASE_URL}/Ticket/${t.ticket_id}/ITILSolution`, { headers: hdrs(token) })
        if (r.status === 401) { token = await initSession(); r = await fetch(`${INST.BASE_URL}/Ticket/${t.ticket_id}/ITILSolution`, { headers: hdrs(token) }) }
        if (!r.ok) return null
        const data = await r.json()
        if (!Array.isArray(data) || !data.length) return null
        const last = data[data.length - 1]
        return { ticketId: t.ticket_id, solution: stripHtml(last.content ?? ''), date_solved: toISO(last.date_creation) }
      } catch { return null }
    }))
    rs.forEach(res => { if (res) map.set(res.ticketId, { solution: res.solution, date_solved: res.date_solved }) })
    if (i + 5 < solved.length) await new Promise(r => setTimeout(r, 300))
  }
  return map
}

async function upsert(tickets: TD[], withEnrichment: boolean): Promise<void> {
  const now = new Date().toISOString()
  for (let i = 0; i < tickets.length; i += 100) {
    const { error } = await supabase.from('tickets_cache').upsert(
      tickets.slice(i, i + 100).map(t => {
        const base: Record<string, unknown> = {
          ticket_id: t.ticket_id, instance: t.instance,
          title: t.title, entity: t.entity, entity_full: t.entity_full,
          category: t.category, root_category: t.root_category,
          status_id: t.status_id, status_key: t.status_key, status_name: t.status_name,
          group_name: t.group_name, requester: t.requester, requester_id: t.requester_id,
          urgency: t.urgency, impact: t.impact, priority_id: t.priority_id, type_id: t.type_id,
          global_validation: t.global_validation,
          date_created: t.date_created, date_mod: t.date_mod, due_date: t.due_date,
          date_solved: t.date_solved, date_close: t.date_close,
          resolution_duration: t.resolution_duration, waiting_duration: t.waiting_duration,
          location: t.location, sla_ttr_name: t.sla_ttr_name, sla_tto_name: t.sla_tto_name,
          is_sla_late: t.is_sla_late, is_overdue_first: t.is_overdue_first, is_overdue_resolve: t.is_overdue_resolve,
          is_deleted: t.is_deleted, request_source: t.request_source || '',
          last_sync: now, updated_at: now,
        }
        if (withEnrichment) {
          base.technician = t.technician
          base.technician_id = t.technician_id
          base.solution = t.solution || null
        }
        return base
      }),
      { onConflict: 'ticket_id,instance' }
    )
    if (error) console.error(`[upsert] batch ${i}:`, error.message)
  }
}

async function backfillTechs(token: string): Promise<void> {
  const { data } = await supabase.from('tickets_cache').select('ticket_id')
    .eq('instance', INST_NAME).is('technician', null)
    .in('status_key', ['new', 'processing', 'pending', 'pending-approval'])
    .limit(BACKFILL_TECH)
  if (!data?.length) return
  console.log(`[${INST_NAME}] backfill techs: ${data.length}`)
  const placeholders = data.map(r => ({ ticket_id: r.ticket_id, instance: INST_NAME } as TD))
  const techMap = await fetchTechs(placeholders, token)
  if (!techMap.size) return
  await Promise.all(Array.from(techMap.entries()).map(([tid, tech]) =>
    supabase.from('tickets_cache').update({ technician: tech.name, technician_id: tech.id, updated_at: new Date().toISOString() })
      .eq('ticket_id', tid).eq('instance', INST_NAME)
  ))
  console.log(`[${INST_NAME}] backfill techs: ${techMap.size} atualizados`)
}

async function backfillSols(token: string): Promise<void> {
  const { data } = await supabase.from('tickets_cache').select('ticket_id,status_key')
    .eq('instance', INST_NAME).is('solution', null)
    .in('status_key', ['solved', 'closed']).limit(BACKFILL_SOL)
  if (!data?.length) return
  console.log(`[${INST_NAME}] backfill solutions: ${data.length}`)
  const placeholders = data.map(r => ({ ticket_id: r.ticket_id, instance: INST_NAME, status_key: r.status_key } as TD))
  const solMap = await fetchSols(placeholders, token)
  if (!solMap.size) return
  await Promise.all(Array.from(solMap.entries()).map(([tid, sol]) =>
    supabase.from('tickets_cache').update({ solution: sol.solution, date_solved: sol.date_solved, updated_at: new Date().toISOString() })
      .eq('ticket_id', tid).eq('instance', INST_NAME)
  ))
  console.log(`[${INST_NAME}] backfill solutions: ${solMap.size} atualizados`)
}

Deno.serve(async (req: Request): Promise<Response> => {
  const start = Date.now()
  const ok = (b: Record<string,unknown>) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } })

  try {
    let body: any = {}
    try { body = await req.json() } catch { /* cron sends empty body */ }
    const { reset = false, mode: forceMode } = body

    if (reset) {
      console.log(`[${INST_NAME}] reset: limpando dados`)
      await supabase.from('tickets_cache').delete().eq('instance', INST_NAME)
      await supabase.from('sync_control').delete().eq('instance', INST_NAME)
    }

    const [ctrlRes, empty] = await Promise.all([
      supabase.from('sync_control').select('status,last_page').eq('instance', INST_NAME).maybeSingle(),
      isCacheEmpty(),
    ])
    const ctrl = ctrlRes.data
    const needsFull = !ctrl || ['pending','in_progress','failed'].includes(ctrl.status)
    const mode: 'full'|'incremental' = (reset || forceMode === 'full' || needsFull || empty) ? 'full' : 'incremental'

    console.log(`[${INST_NAME}] mode=${mode} ctrl=${ctrl?.status ?? 'novo'} empty=${empty}`)

    let token = await initSession()
    let all: TD[] = []
    let completed = true, lastPage = 0, totalPages = 0

    if (mode === 'full') {
      const startPage = (ctrl?.status === 'in_progress' && (ctrl?.last_page ?? 0) > 0) ? ctrl.last_page as number : 0
      console.log(startPage > 0 ? `[${INST_NAME}] retomando p├ígina ${startPage}` : `[${INST_NAME}] full sync in├¡cio`)

      let page = startPage
      let buf: TD[] = []
      while (page < startPage + MAX_PAGES_SWEEP) {
        const url = searchUrl(page * 25, page * 25 + 24)
        const res = await fetchPage(url, token)
        token = res.token
        if (page === startPage) {
          totalPages = Math.ceil(res.total / 25)
          console.log(`[${INST_NAME}] total: ${res.total} tickets (${totalPages} pgs)`)
        }
        if (!res.data.length) break
        buf.push(...processRows(res.data))
        page++; lastPage = page
        const done = res.data.length < 25 || page >= totalPages
        if (buf.length >= 500 || done || page >= startPage + MAX_PAGES_SWEEP) {
          await upsert(buf, false)
          all.push(...buf)
          buf = []
          await supabase.from('sync_control').upsert({
            instance: INST_NAME, status: 'in_progress', last_page: lastPage,
            total_pages: totalPages, updated_at: new Date().toISOString(),
          }, { onConflict: 'instance' })
          console.log(`[${INST_NAME}] checkpoint pg ${lastPage}/${totalPages}`)
        }
        if (done) break
      }
      completed = lastPage >= totalPages

    } else {
      const lastSync = ctrl?.last_sync ? new Date(ctrl.last_sync) : new Date(Date.now() - INCREMENTAL_WINDOW * 60000)
      const since = new Date(lastSync.getTime() - INCREMENTAL_WINDOW * 60000).toISOString().replace('T', ' ').substring(0, 19)
      console.log(`[${INST_NAME}] incremental desde: ${since}`)
      let page = 0
      while (true) {
        const url = searchUrl(page * 25, page * 25 + 24, since)
        const res = await fetchPage(url, token)
        token = res.token
        if (page === 0) { totalPages = Math.ceil(res.total / 25); console.log(`[${INST_NAME}] ${res.total} alterados`) }
        if (!res.data.length) break
        all.push(...processRows(res.data))
        page++
        if (res.data.length < 25 || page >= totalPages || page >= MAX_PAGES_INCREMENTAL) break
      }
    }

    if (all.length > 0) {
      if (mode === 'incremental') {
        console.log(`[${INST_NAME}] enriching ${all.length} tickets`)
        const techMap = await fetchTechs(all, token)
        all.forEach(t => { const tech = techMap.get(t.ticket_id); if (tech) { t.technician = tech.name; t.technician_id = tech.id } })
        const solMap = await fetchSols(all, token)
        all.forEach(t => { const sol = solMap.get(t.ticket_id); if (sol) { t.solution = sol.solution; if (sol.date_solved) t.date_solved = sol.date_solved } })
        await upsert(all, true)
      }
      console.log(`[${INST_NAME}] ${all.length} tickets salvos`)
    }

    if (mode === 'incremental') {
      await backfillTechs(token)
      await backfillSols(token)
    }

    const { error: ctrlErr } = await supabase.from('sync_control').upsert({
      instance: INST_NAME, last_sync: new Date().toISOString(),
      status: completed ? 'success' : 'in_progress',
      last_page: completed ? 0 : lastPage, total_pages: totalPages,
      tickets_count: all.length, updated_at: new Date().toISOString(),
    }, { onConflict: 'instance' })
    if (ctrlErr) console.warn(`[${INST_NAME}] ctrl:`, ctrlErr.message)

    await supabase.from('sync_logs').insert({
      instance: INST_NAME, finished_at: new Date().toISOString(),
      status: completed ? 'success' : 'partial',
      tickets_processed: all.length,
    })

    return ok({ success: true, instance: INST_NAME, mode, count: all.length, completed, lastPage, totalPages, duration_ms: Date.now() - start })
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error(`[${INST_NAME}] erro:`, msg)
    await supabase.from('sync_control').upsert({ instance: INST_NAME, status: 'failed', error_message: msg, updated_at: new Date().toISOString() }, { onConflict: 'instance' })
    return ok({ success: false, instance: INST_NAME, error: msg, duration_ms: Date.now() - start })
  }
})
