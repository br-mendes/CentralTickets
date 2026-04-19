import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// Full sweep: sem tech/solution fetch → rápido (40 páginas/run = 1000 tickets)
// Incremental: com enrichment + backfill dos campos faltantes
const MAX_PAGES_SWEEP       = 40
const MAX_PAGES_INCREMENTAL = 8
const INCREMENTAL_WINDOW    = 15  // minutos
const BACKFILL_TECH         = 200 // tickets com técnico faltando por run
const BACKFILL_SOL          = 50  // tickets com solução faltando por run

// Campos GLPI: 55 = global_validation (determina pending-approval)
const DISPLAY_FIELDS = [1,2,3,4,5,7,8,10,12,14,15,17,18,19,20,22,55,80,83,151]

// ── Normalização de nomes ─────────────────────────────────────────────────────

const STRIP: Record<string, RegExp[]> = {
  PETA: [
    /^peta\s+grupo\s*[>\\/|]\s*/i,
    /^peta\s+grupo\s+/i,
    /^peta\s*[>\\/|]\s*/i,
    /^peta\s*[-–—]\s*/i,
    /^peta\s+/i,
  ],
  GMX: [
    /^gmx\s+tecnologia\s*[>\\/|]\s*/i,
    /^gmx\s+tecnologia\s+/i,
    /^gmx\s*[>\\/|]\s*/i,
    /^gmx\s*[-–—]\s*/i,
    /^gmx\s+/i,
  ],
}

function norm(s: string, inst: string): string {
  if (!s) return ''
  const t = s.trim()
  for (const p of (STRIP[inst] ?? [])) {
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
  if (gv === 2 && id !== 5 && id !== 6) return 'Aprovação'
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
function rootCat(c: string): string { return c ? c.split(' > ')[0].trim() : 'Não categorizado' }

// ── GLPI ──────────────────────────────────────────────────────────────────────

type Inst = typeof INSTANCES.PETA

async function initSession(inst: Inst): Promise<string> {
  if (!inst.BASE_URL) throw new Error('GLPI BASE_URL não configurado')
  const r = await fetch(`${inst.BASE_URL}/initSession`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `user_token ${inst.USER_TOKEN}`, 'App-Token': inst.APP_TOKEN },
  })
  if (!r.ok) throw new Error(`initSession ${r.status}: ${await r.text()}`)
  const d = await r.json()
  if (!d.session_token) throw new Error('initSession: sem session_token')
  return d.session_token
}

function hdrs(token: string, inst: Inst) {
  return { 'Content-Type': 'application/json', 'Session-Token': token, 'App-Token': inst.APP_TOKEN }
}

function searchUrl(inst: Inst, start: number, end: number, since?: string): string {
  const p = new URLSearchParams({ range: `${start}-${end}`, expand_dropdowns: 'true', get_hateoas: 'false' })
  DISPLAY_FIELDS.forEach((id, i) => p.append(`forcedisplay[${i}]`, String(id)))
  if (since) {
    p.append('criteria[0][field]', '19')
    p.append('criteria[0][searchtype]', 'morethan')
    p.append('criteria[0][value]', since)
  }
  return `${inst.BASE_URL}/search/Ticket?${p}`
}

async function fetchPage(url: string, inst: Inst, token: string) {
  let r = await fetch(url, { headers: hdrs(token, inst) })
  if (r.status === 401) { token = await initSession(inst); r = await fetch(url, { headers: hdrs(token, inst) }) }
  if (!r.ok) throw new Error(`GLPI ${r.status}: ${(await r.text()).substring(0, 200)}`)
  const j = await r.json()
  return { data: j.data ?? [], total: j.totalcount ?? 0, token }
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

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
  is_deleted: boolean; solution: string
}

function processRows(rows: any[], inst: string): TD[] {
  return rows.map(r => {
    const sid  = parseInt(r[12]) || 1
    const gv   = parseInt(r[55]) || 1
    const due  = r[151] || null
    const late = slaLate(due)
    const cat  = norm(r[7] || '', inst) || 'Não categorizado'
    return {
      ticket_id:           parseInt(r[2]) || r.id,
      instance:            inst,
      title:               r[1] || 'Sem título',
      entity:              norm(r[80] || '', inst),
      entity_full:         r[80] || '',
      category:            cat,
      root_category:       rootCat(cat),
      status_id:           sid,
      status_key:          statusKey(sid, gv),
      status_name:         statusName(sid, gv),
      group_name:          norm(r[8] || '', inst),
      technician:          '', technician_id: 0,
      requester:           r[10] || '', requester_id: 0,
      urgency:             parseInt(r[4]) || 3,
      impact:              parseInt(r[5]) || 3,
      priority_id:         parseInt(r[3]) || 3,
      type_id:             parseInt(r[14]) || 2,
      global_validation:   gv,
      date_created:        toISO(r[15]),
      date_mod:            toISO(r[19]),
      due_date:            toISO(due),
      date_solved:         toISO(r[17]),
      date_close:          toISO(r[18]),
      resolution_duration: parseInt(r[20]) || 0,
      waiting_duration:    parseInt(r[22]) || 0,
      location:            norm(r[83] || '', inst),
      sla_ttr_name: '', sla_tto_name: '',
      is_sla_late: late, is_overdue_first: late, is_overdue_resolve: late,
      is_deleted: false, solution: '',
    }
  })
}

// ── Técnicos ──────────────────────────────────────────────────────────────────

async function fetchTechs(tickets: TD[], inst: Inst, token: string): Promise<Map<number,{name:string,id:number}>> {
  const map = new Map<number,{name:string,id:number}>()
  for (let i = 0; i < tickets.length; i += 10) {
    const sl = tickets.slice(i, i + 10)
    const rs = await Promise.all(sl.map(async t => {
      try {
        let r1 = await fetch(`${inst.BASE_URL}/Ticket/${t.ticket_id}/Ticket_User`, { headers: hdrs(token, inst) })
        if (r1.status === 401) { token = await initSession(inst); r1 = await fetch(`${inst.BASE_URL}/Ticket/${t.ticket_id}/Ticket_User`, { headers: hdrs(token, inst) }) }
        if (!r1.ok) return null
        const actors = await r1.json()
        if (!Array.isArray(actors)) return null
        const tech = actors.find((a: any) => a.type === 2)
        if (!tech?.users_id) return null
        const r2 = await fetch(`${inst.BASE_URL}/User/${tech.users_id}`, { headers: hdrs(token, inst) })
        if (!r2.ok) return { id: tech.users_id, name: String(tech.users_id) }
        const u = await r2.json()
        return { id: tech.users_id, name: [u.firstname, u.realname].filter(Boolean).join(' ') || u.name || String(tech.users_id) }
      } catch { return null }
    }))
    rs.forEach((res, idx) => { if (res) map.set(sl[idx].ticket_id, res) })
    if (i + 10 < tickets.length) await new Promise(r => setTimeout(r, 100))
  }
  return map
}

// ── Soluções ──────────────────────────────────────────────────────────────────

async function fetchSols(tickets: TD[], inst: Inst, token: string): Promise<Map<number,{solution:string,date_solved:string|null}>> {
  const map = new Map<number,{solution:string,date_solved:string|null}>()
  const solved = tickets.filter(t => t.status_key === 'solved' || t.status_key === 'closed')
  if (!solved.length) return map
  for (let i = 0; i < solved.length; i += 10) {
    const sl = solved.slice(i, i + 10)
    const rs = await Promise.all(sl.map(async t => {
      try {
        let r = await fetch(`${inst.BASE_URL}/Ticket/${t.ticket_id}/ITILSolution`, { headers: hdrs(token, inst) })
        if (r.status === 401) { token = await initSession(inst); r = await fetch(`${inst.BASE_URL}/Ticket/${t.ticket_id}/ITILSolution`, { headers: hdrs(token, inst) }) }
        if (!r.ok) return null
        const data = await r.json()
        if (!Array.isArray(data) || !data.length) return null
        const last = data[data.length - 1]
        return { ticketId: t.ticket_id, solution: stripHtml(last.content ?? ''), date_solved: toISO(last.date_creation) }
      } catch { return null }
    }))
    rs.forEach(res => { if (res) map.set(res.ticketId, { solution: res.solution, date_solved: res.date_solved }) })
    if (i + 10 < solved.length) await new Promise(r => setTimeout(r, 100))
  }
  return map
}

// ── Upsert ────────────────────────────────────────────────────────────────────

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
          is_deleted: t.is_deleted, last_sync: now, updated_at: now,
        }
        // Só inclui technician/solution no upsert quando foi enriquecido
        // Assim, sweep não sobrescreve valores que já existem
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

// ── Backfill técnicos (incremental) ──────────────────────────────────────────

async function backfillTechs(instName: string, inst: Inst, token: string): Promise<void> {
  const { data } = await supabase.from('tickets_cache').select('ticket_id')
    .eq('instance', instName).is('technician', null)
    .in('status_key', ['new', 'processing', 'pending', 'pending-approval'])
    .limit(BACKFILL_TECH)
  if (!data?.length) return
  console.log(`[${instName}] backfill techs: ${data.length}`)
  const placeholders = data.map(r => ({ ticket_id: r.ticket_id, instance: instName } as TD))
  const techMap = await fetchTechs(placeholders, inst, token)
  if (!techMap.size) return
  await Promise.all(Array.from(techMap.entries()).map(([tid, tech]) =>
    supabase.from('tickets_cache').update({ technician: tech.name, technician_id: tech.id, updated_at: new Date().toISOString() })
      .eq('ticket_id', tid).eq('instance', instName)
  ))
  console.log(`[${instName}] backfill techs: ${techMap.size} atualizados`)
}

// ── Backfill soluções (incremental) ──────────────────────────────────────────

async function backfillSols(instName: string, inst: Inst, token: string): Promise<void> {
  const { data } = await supabase.from('tickets_cache').select('ticket_id,status_key')
    .eq('instance', instName).is('solution', null)
    .in('status_key', ['solved', 'closed']).limit(BACKFILL_SOL)
  if (!data?.length) return
  console.log(`[${instName}] backfill solutions: ${data.length}`)
  const placeholders = data.map(r => ({ ticket_id: r.ticket_id, instance: instName, status_key: r.status_key } as TD))
  const solMap = await fetchSols(placeholders, inst, token)
  if (!solMap.size) return
  await Promise.all(Array.from(solMap.entries()).map(([tid, sol]) =>
    supabase.from('tickets_cache').update({ solution: sol.solution, date_solved: sol.date_solved, updated_at: new Date().toISOString() })
      .eq('ticket_id', tid).eq('instance', instName)
  ))
  console.log(`[${instName}] backfill solutions: ${solMap.size} atualizados`)
}

// ── Sync ──────────────────────────────────────────────────────────────────────

interface SR { success: boolean; count: number; mode: string; error?: string; completed?: boolean; lastPage?: number; totalPages?: number }

async function syncInstance(instName: 'PETA'|'GMX', mode: 'full'|'incremental'): Promise<SR> {
  const inst = INSTANCES[instName]
  console.log(`[${instName}] mode=${mode}`)
  try {
    const { data: ctrl } = await supabase.from('sync_control').select('*').eq('instance', instName).maybeSingle()
    let token = await initSession(inst)
    let all: TD[] = []
    let completed = true, lastPage = 0, totalPages = 0

    if (mode === 'full') {
      const startPage = (ctrl?.status === 'in_progress' && (ctrl?.last_page ?? 0) > 0) ? ctrl.last_page as number : 0
      if (startPage === 0) {
        console.log(`[${instName}] limpando dados`)
        await supabase.from('tickets_cache').delete().eq('instance', instName)
        await supabase.from('sync_control').delete().eq('instance', instName)
      } else {
        console.log(`[${instName}] retomando página ${startPage}`)
      }
      let page = startPage
      while (page < startPage + MAX_PAGES_SWEEP) {
        const url = searchUrl(inst, page * 25, page * 25 + 24)
        const res = await fetchPage(url, inst, token)
        token = res.token
        if (page === startPage) {
          totalPages = Math.ceil(res.total / 25)
          console.log(`[${instName}] total: ${res.total} tickets (${totalPages} pgs)`)
        }
        if (!res.data.length) break
        all.push(...processRows(res.data, instName))
        page++; lastPage = page
        if (res.data.length < 25 || page >= totalPages) break
      }
      completed = lastPage >= totalPages

    } else {
      const lastSync = ctrl?.last_sync ? new Date(ctrl.last_sync) : new Date(Date.now() - INCREMENTAL_WINDOW * 60000)
      const since = new Date(lastSync.getTime() - INCREMENTAL_WINDOW * 60000).toISOString().replace('T', ' ').substring(0, 19)
      console.log(`[${instName}] incremental desde: ${since}`)
      let page = 0
      while (true) {
        const url = searchUrl(inst, page * 25, page * 25 + 24, since)
        const res = await fetchPage(url, inst, token)
        token = res.token
        if (page === 0) { totalPages = Math.ceil(res.total / 25); console.log(`[${instName}] ${res.total} alterados`) }
        if (!res.data.length) break
        all.push(...processRows(res.data, instName))
        page++
        if (res.data.length < 25 || page >= totalPages || page >= MAX_PAGES_INCREMENTAL) break
      }
    }

    if (all.length > 0) {
      if (mode === 'incremental') {
        console.log(`[${instName}] enriching ${all.length} tickets`)
        const techMap = await fetchTechs(all, inst, token)
        all.forEach(t => { const tech = techMap.get(t.ticket_id); if (tech) { t.technician = tech.name; t.technician_id = tech.id } })
        const solMap = await fetchSols(all, inst, token)
        all.forEach(t => { const sol = solMap.get(t.ticket_id); if (sol) { t.solution = sol.solution; if (sol.date_solved) t.date_solved = sol.date_solved } })
        await upsert(all, true)
      } else {
        await upsert(all, false)
      }
      console.log(`[${instName}] ${all.length} tickets salvos`)
    }

    if (mode === 'incremental') {
      await backfillTechs(instName, inst, token)
      await backfillSols(instName, inst, token)
    }

    await supabase.from('sync_control').upsert({
      instance: instName, last_sync: new Date().toISOString(),
      status: completed ? 'success' : 'in_progress',
      last_page: completed ? 0 : lastPage, total_pages: totalPages,
      tickets_count: all.length, updated_at: new Date().toISOString(),
    }, { onConflict: 'instance' }).catch(e => console.warn(`[${instName}] ctrl:`, e.message))

    return { success: true, count: all.length, mode, completed, lastPage, totalPages }
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error(`[${instName}] erro:`, msg)
    await supabase.from('sync_control').upsert({ instance: instName, status: 'failed', error_message: msg, updated_at: new Date().toISOString() }, { onConflict: 'instance' }).catch(() => {})
    return { success: false, count: 0, mode, error: msg }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const start = Date.now()
  const ok = (b: Record<string,unknown>) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } })

  try {
    const body = await req.json().catch(() => ({})) as any
    const { reset_peta = false, reset_gmx = false, instance, mode } = body

    const [petaRes, gmxRes] = await Promise.all([
      supabase.from('sync_control').select('status,last_page').eq('instance', 'PETA').maybeSingle(),
      supabase.from('sync_control').select('status,last_page').eq('instance', 'GMX').maybeSingle(),
    ])
    const pc = petaRes.data, gc = gmxRes.data
    const needsFull = (c: any) => !c || c.status === 'pending' || c.status === 'in_progress'

    const pm: 'full'|'incremental' = (reset_peta || mode === 'full' || needsFull(pc)) ? 'full' : 'incremental'
    const gm: 'full'|'incremental' = (reset_gmx  || mode === 'full' || needsFull(gc))  ? 'full' : 'incremental'

    console.log(`[entry] PETA=${pm}(${pc?.status ?? 'novo'}) GMX=${gm}(${gc?.status ?? 'novo'})`)

    const skip = (n: string): SR => ({ success: true, count: 0, mode: `skipped:${n}`, completed: true })
    const [pr, gr] = await Promise.all([
      (!instance || instance === 'PETA') ? syncInstance('PETA', pm) : Promise.resolve(skip('PETA')),
      (!instance || instance === 'GMX')  ? syncInstance('GMX',  gm) : Promise.resolve(skip('GMX')),
    ])

    await supabase.from('sync_logs').insert({
      instance: 'ALL', finished_at: new Date().toISOString(),
      status: (!pr.success || !gr.success) ? 'failed' : ((pr.completed ?? true) && (gr.completed ?? true)) ? 'success' : 'partial',
      tickets_processed: pr.count + gr.count,
      error_message: pr.error ?? gr.error ?? null,
    }).catch(e => console.warn('sync_logs:', e.message))

    return ok({ success: !(!pr.success || !gr.success), duration_ms: Date.now() - start, results: { peta: pr, gmx: gr }, needsResume: !((pr.completed ?? true) && (gr.completed ?? true)) })
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error('[entry]', msg)
    return ok({ success: false, error: msg, duration_ms: Date.now() - start })
  }
})
