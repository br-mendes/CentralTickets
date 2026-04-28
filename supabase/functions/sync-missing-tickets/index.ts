// supabase/functions/sync-missing-tickets/index.ts
//
// Correções em relação às funções sync-peta / sync-gmx:
//
// 1. DISPLAY_FIELDS inclui campo 9 (técnico) e campo 21 (canal de requisição).
//    Antes esses campos não eram solicitados → chegavam undefined.
//
// 2. processRows lê técnico de r[9] e request_type de r[21] diretamente,
//    eliminando a dependência do backfill lento para tickets ativos.
//
// 3. Campos FK gravados: entity_id, group_id, requester_id, request_type_id.
//    O campo 9 no GLPI = técnico (não request_type como era interpretado antes).
//    O campo 21 = canal/source da requisição.
//
// 4. Paginação incremental usa offset correto (PAGE_SIZE, não 25).
//
// 5. Timezone: since convertido para UTC-3 (GLPI local).
//
// 6. Suporta instâncias PETA, GMX ou ALL em uma única chamada.
//
// Chamada:
//   POST { "instance": "PETA"|"GMX"|"ALL", "mode": "missing"|"full"|"incremental",
//          "reset": false, "since": "2026-04-23T22:00:00" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// =============================================================================
// CONFIG
// =============================================================================

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')              ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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
} as const

type InstanceName = keyof typeof INSTANCES

// Campos solicitados ao GLPI via forcedisplay:
//  1=título          2=id            3=prioridade      4=urgência       5=impacto
//  7=categoria       8=grupo atrib.  9=técnico atrib.  10=requisitante  12=status
//  14=tipo           15=data_criação 17=data_solução   18=data_fechamento
//  19=date_mod       20=dur_resolução                  21=canal_requisição
//  22=tempo_espera   55=validação_global               80=entidade
//  83=localização    151=time_to_resolve (due_date)
const DISPLAY_FIELDS = [
  1, 2, 3, 4, 5, 7, 8,
  9,   // técnico atribuído (campo ausente nas funções anteriores)
  10, 12, 14, 15, 17, 18, 19, 20,
  21,  // canal de requisição (campo ausente nas funções anteriores)
  22, 55, 80, 83, 151,
]

const PAGE_SIZE          = 200
const BATCH_SIZE         = 200
const BATCH_DELAY_MS     = 300
const INCREMENTAL_WINDOW = 15
const GLPI_TZ_OFFSET_MS  = -3 * 60 * 60 * 1000   // UTC-3 (America/Sao_Paulo)
const BACKFILL_TECH      = 50
const BACKFILL_SOL       = 30

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// =============================================================================
// UTILS
// =============================================================================

function log(tag: string, msg: string, extra?: unknown) {
  const ts = new Date().toISOString()
  if (extra !== undefined) console.log(`[${ts}] [${tag}] ${msg}`, extra)
  else console.log(`[${ts}] [${tag}] ${msg}`)
}

function logErr(tag: string, msg: string, err: unknown) {
  const ts = new Date().toISOString()
  const d = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
  console.error(`[${ts}] [${tag}] ${msg}: ${d}`)
}

// Extrai string de qualquer valor retornado pelo GLPI.
// Com expand_dropdowns=true, campos de lookup chegam como objeto
// { completename, name, id } ou como string direta.
function glpiStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    const s = o.completename ?? o.name ?? o.id ?? ''
    return String(s).trim()
  }
  return String(v).trim()
}

function glpiStrOrNull(v: unknown): string | null {
  const s = glpiStr(v)
  return s === '' ? null : s
}

// Extrai ID numérico de campo de lookup (objeto { id } ou número ou string).
function glpiId(v: unknown): number {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = parseInt(v, 10); return isNaN(n) ? 0 : n }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.id === 'number') return o.id
    if (typeof o.id === 'string') { const n = parseInt(o.id, 10); return isNaN(n) ? 0 : n }
  }
  return 0
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

function rootCat(c: string): string {
  return c ? c.split(' > ')[0].trim() : 'Não categorizado'
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// Converte Date UTC → "YYYY-MM-DD HH:MM:SS" no fuso UTC-3 (horário GLPI).
function toGlpiLocalTime(date: Date): string {
  const local = new Date(date.getTime() + GLPI_TZ_OFFSET_MS)
  return local.toISOString().replace('T', ' ').substring(0, 19)
}

// =============================================================================
// GLPI SESSION
// =============================================================================

async function initSession(inst: InstanceName): Promise<string> {
  const cfg = INSTANCES[inst]
  if (!cfg.BASE_URL || !cfg.USER_TOKEN || !cfg.APP_TOKEN)
    throw new Error(`Secrets faltando para ${inst}: BASE_URL=${!!cfg.BASE_URL} USER_TOKEN=${!!cfg.USER_TOKEN} APP_TOKEN=${!!cfg.APP_TOKEN}`)
  log(inst, `initSession -> ${cfg.BASE_URL}/initSession`)
  const r = await fetch(`${cfg.BASE_URL}/initSession`, {
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `user_token ${cfg.USER_TOKEN}`,
      'App-Token':     cfg.APP_TOKEN,
    },
  })
  if (!r.ok) throw new Error(`initSession ${inst} HTTP ${r.status}: ${await r.text()}`)
  const d = await r.json()
  if (!d.session_token) throw new Error(`initSession ${inst}: sem session_token na resposta`)
  log(inst, 'initSession OK')
  return d.session_token
}

async function killSession(inst: InstanceName, token: string) {
  try {
    await fetch(`${INSTANCES[inst].BASE_URL}/killSession`, {
      headers: { 'Session-Token': token, 'App-Token': INSTANCES[inst].APP_TOKEN },
    })
    log(inst, 'killSession OK')
  } catch (e) { logErr(inst, 'killSession (ignorando)', e) }
}

function hdrs(inst: InstanceName, token: string) {
  return {
    'Content-Type': 'application/json',
    'Session-Token': token,
    'App-Token':     INSTANCES[inst].APP_TOKEN,
  }
}

// =============================================================================
// GLPI SEARCH
// =============================================================================

function searchUrl(inst: InstanceName, offset: number, since?: string): string {
  const p = new URLSearchParams({
    range:            `${offset}-${offset + PAGE_SIZE - 1}`,
    expand_dropdowns: 'true',
    get_hateoas:      'false',
    sort:             '2',
    order:            'ASC',
  })
  DISPLAY_FIELDS.forEach((id, i) => p.append(`forcedisplay[${i}]`, String(id)))
  if (since) {
    p.append('criteria[0][field]',      '19')
    p.append('criteria[0][searchtype]', 'morethan')
    p.append('criteria[0][value]',      since)
  }
  return `${INSTANCES[inst].BASE_URL}/search/Ticket?${p}`
}

async function fetchPage(
  inst: InstanceName,
  url: string,
  token: string,
): Promise<{ data: any[]; total: number; token: string }> {
  let r = await fetch(url, { headers: hdrs(inst, token) })
  if (r.status === 401) {
    log(inst, 'session expirada, renovando')
    token = await initSession(inst)
    r = await fetch(url, { headers: hdrs(inst, token) })
  }
  if (r.status === 429) {
    log(inst, 'rate limit 429, aguardando 3s')
    await sleep(3000)
    r = await fetch(url, { headers: hdrs(inst, token) })
  }
  if (!r.ok) throw new Error(`GLPI search HTTP ${r.status}: ${(await r.text()).substring(0, 300)}`)
  const j = await r.json()
  return { data: j.data ?? [], total: j.totalcount ?? 0, token }
}

// =============================================================================
// ENRICHMENT (backfill — cobre casos onde search retornar vazio)
// =============================================================================

async function fetchTechs(
  inst: InstanceName,
  tickets: Array<{ ticket_id: number }>,
  token: string,
): Promise<{ map: Map<number, { name: string; id: number }>; token: string }> {
  const map = new Map<number, { name: string; id: number }>()
  const cfg = INSTANCES[inst]
  for (let i = 0; i < tickets.length; i += 5) {
    const sl = tickets.slice(i, i + 5)
    const results = await Promise.all(sl.map(async t => {
      try {
        let r = await fetch(`${cfg.BASE_URL}/Ticket/${t.ticket_id}/Ticket_User`, { headers: hdrs(inst, token) })
        if (r.status === 401) { token = await initSession(inst); r = await fetch(`${cfg.BASE_URL}/Ticket/${t.ticket_id}/Ticket_User`, { headers: hdrs(inst, token) }) }
        if (!r.ok) return null
        const actors = await r.json()
        if (!Array.isArray(actors)) return null
        const tech = actors.find((a: any) => a.type === 2)
        if (!tech?.users_id) return null
        const r2 = await fetch(`${cfg.BASE_URL}/User/${tech.users_id}`, { headers: hdrs(inst, token) })
        if (!r2.ok) return { id: tech.users_id, name: String(tech.users_id) }
        const u = await r2.json()
        return { id: tech.users_id, name: [u.firstname, u.realname].filter(Boolean).join(' ') || u.name || String(tech.users_id) }
      } catch (e) { logErr(inst, `fetchTechs ticket ${t.ticket_id}`, e); return null }
    }))
    results.forEach((res, idx) => { if (res) map.set(sl[idx].ticket_id, res) })
    if (i + 5 < tickets.length) await sleep(BATCH_DELAY_MS)
  }
  return { map, token }
}

async function fetchSols(
  inst: InstanceName,
  tickets: Array<{ ticket_id: number; status_key: string }>,
  token: string,
): Promise<{ map: Map<number, { solution: string; date_solved: string | null }>; token: string }> {
  const map = new Map<number, { solution: string; date_solved: string | null }>()
  const cfg = INSTANCES[inst]
  const solved = tickets.filter(t => t.status_key === 'solved' || t.status_key === 'closed')
  if (!solved.length) return { map, token }
  for (let i = 0; i < solved.length; i += 5) {
    const sl = solved.slice(i, i + 5)
    const results = await Promise.all(sl.map(async t => {
      try {
        let r = await fetch(`${cfg.BASE_URL}/Ticket/${t.ticket_id}/ITILSolution`, { headers: hdrs(inst, token) })
        if (r.status === 401) { token = await initSession(inst); r = await fetch(`${cfg.BASE_URL}/Ticket/${t.ticket_id}/ITILSolution`, { headers: hdrs(inst, token) }) }
        if (!r.ok) return null
        const data = await r.json()
        if (!Array.isArray(data) || !data.length) return null
        const last = data[data.length - 1]
        return { ticketId: t.ticket_id, solution: stripHtml(last.content ?? ''), date_solved: toISO(last.date_creation) }
      } catch (e) { logErr(inst, `fetchSols ticket ${t.ticket_id}`, e); return null }
    }))
    results.forEach(res => { if (res) map.set(res.ticketId, { solution: res.solution, date_solved: res.date_solved }) })
    if (i + 5 < solved.length) await sleep(BATCH_DELAY_MS)
  }
  return { map, token }
}

// =============================================================================
// PROCESS ROWS
// =============================================================================

interface TD {
  ticket_id: number; instance: string
  title: string; entity: string; entity_full: string; entity_id: number
  category: string; root_category: string
  status_id: number; status_key: string; status_name: string
  group_name: string; group_id: number
  technician: string; technician_id: number
  requester: string; requester_id: number
  request_type: string; request_type_id: number
  urgency: number; impact: number; priority_id: number; type_id: number
  global_validation: number
  date_created: string | null; date_mod: string | null; due_date: string | null
  date_solved: string | null; date_close: string | null
  resolution_duration: number; waiting_duration: number; location: string
  sla_ttr_name: string; sla_tto_name: string
  is_sla_late: boolean; is_overdue_first: boolean; is_overdue_resolve: boolean
  is_deleted: boolean; solution: string
}

function processRows(rows: any[], inst: InstanceName): TD[] {
  return rows.flatMap(r => {
    const tid = parseInt(r[2]) || parseInt(r.id) || 0
    if (!tid) return []
    const sid = parseInt(r[12]) || 1
    const gv  = parseInt(r[55]) || 1
    const due = r[151] || null
    const late = slaLate(due)
    const cat = glpiStr(r[7]) || 'Não categorizado'
    const pid = parseInt(r[3]) || 3

    return [{
      ticket_id:           tid,
      instance:            inst,
      title:               glpiStr(r[1]) || 'Sem título',
      entity:              glpiStr(r[80]),
      entity_full:         glpiStr(r[80]),
      entity_id:           glpiId(r[80]),         // FK para glpi_entities
      category:            cat,
      root_category:       rootCat(cat),
      status_id:           sid,
      status_key:          statusKey(sid, gv),
      status_name:         statusName(sid, gv),
      group_name:          glpiStr(r[8]),
      group_id:            glpiId(r[8]),           // FK para glpi_groups
      technician:          glpiStrOrNull(r[9]) ?? '',  // campo 9 = técnico atribuído
      technician_id:       0,                      // backfill preenche via Ticket_User
      requester:           glpiStr(r[10]),
      requester_id:        glpiId(r[10]),          // FK para glpi_users
      request_type:        glpiStrOrNull(r[21]) ?? '', // campo 21 = canal de requisição
      request_type_id:     glpiId(r[21]),          // FK para glpi_requesttypes
      urgency:             parseInt(r[4]) || 3,
      impact:              parseInt(r[5]) || 3,
      priority_id:         pid,
      type_id:             parseInt(r[14]) || 2,
      global_validation:   gv,
      date_created:        toISO(r[15]),
      date_mod:            toISO(r[19]),
      due_date:            toISO(due),
      date_solved:         toISO(r[17]),
      date_close:          toISO(r[18]),
      resolution_duration: parseInt(r[20]) || 0,
      waiting_duration:    parseInt(r[22]) || 0,
      location:            glpiStr(r[83]),
      sla_ttr_name:        '',
      sla_tto_name:        '',
      is_sla_late:         late,
      is_overdue_first:    late,
      is_overdue_resolve:  late,
      is_deleted:          false,
      solution:            '',
    }]
  })
}

// =============================================================================
// UPSERT
// =============================================================================

async function upsert(
  sb: ReturnType<typeof createClient>,
  inst: InstanceName,
  tickets: TD[],
  withEnrichment: boolean,
): Promise<void> {
  const now = new Date().toISOString()
  for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
    const batch = tickets.slice(i, i + BATCH_SIZE)
    const rows = batch.map(t => {
      const base: Record<string, unknown> = {
        ticket_id: t.ticket_id, instance: t.instance,
        title: t.title, entity: t.entity, entity_full: t.entity_full, entity_id: t.entity_id,
        category: t.category, root_category: t.root_category,
        status_id: t.status_id, status_key: t.status_key, status_name: t.status_name,
        group_name: t.group_name, group_id: t.group_id,
        technician: t.technician || null, technician_id: t.technician_id,
        requester: t.requester || null, requester_id: t.requester_id,
        request_type: t.request_type || null, request_type_id: t.request_type_id,
        urgency: t.urgency, impact: t.impact, priority_id: t.priority_id, type_id: t.type_id,
        global_validation: t.global_validation,
        date_created: t.date_created, date_mod: t.date_mod, due_date: t.due_date,
        date_solved: t.date_solved, date_close: t.date_close,
        resolution_duration: t.resolution_duration, waiting_duration: t.waiting_duration,
        location: t.location || null,
        sla_ttr_name: t.sla_ttr_name || null, sla_tto_name: t.sla_tto_name || null,
        is_sla_late: t.is_sla_late, is_overdue_first: t.is_overdue_first, is_overdue_resolve: t.is_overdue_resolve,
        is_deleted: t.is_deleted, last_sync: now, updated_at: now,
      }
      if (withEnrichment) {
        base.solution = t.solution || null
      }
      return base
    })
    const { error } = await sb.from('tickets_cache').upsert(rows, { onConflict: 'ticket_id,instance' })
    if (error) {
      logErr(inst, `upsert batch ${i}`, new Error(error?.message ?? JSON.stringify(error)))
      await sleep(BATCH_DELAY_MS * 2)
    } else {
      await sleep(BATCH_DELAY_MS)
    }
  }
}

// =============================================================================
// BACKFILL — cobre tickets onde o search retornou campo vazio
// =============================================================================

async function backfillTechs(
  sb: ReturnType<typeof createClient>,
  inst: InstanceName,
  token: string,
): Promise<string> {
  const { data } = await sb.from('tickets_cache')
    .select('ticket_id').eq('instance', inst).is('technician', null)
    .in('status_key', ['new', 'processing', 'pending', 'pending-approval'])
    .limit(BACKFILL_TECH)
  if (!data?.length) return token
  log(inst, `backfill techs: ${data.length}`)
  const { map, token: newToken } = await fetchTechs(inst, data.map(r => ({ ticket_id: r.ticket_id })), token)
  if (!map.size) return newToken
  await Promise.all(Array.from(map.entries()).map(([tid, tech]) =>
    sb.from('tickets_cache')
      .update({ technician: tech.name, technician_id: tech.id, updated_at: new Date().toISOString() })
      .eq('ticket_id', tid).eq('instance', inst),
  ))
  log(inst, `backfill techs: ${map.size} atualizados`)
  return newToken
}

async function backfillSols(
  sb: ReturnType<typeof createClient>,
  inst: InstanceName,
  token: string,
): Promise<string> {
  const { data } = await sb.from('tickets_cache')
    .select('ticket_id,status_key').eq('instance', inst).is('solution', null)
    .in('status_key', ['solved', 'closed']).limit(BACKFILL_SOL)
  if (!data?.length) return token
  log(inst, `backfill solutions: ${data.length}`)
  const { map, token: newToken } = await fetchSols(inst, data.map(r => ({ ticket_id: r.ticket_id, status_key: r.status_key })), token)
  if (!map.size) return newToken
  await Promise.all(Array.from(map.entries()).map(([tid, sol]) =>
    sb.from('tickets_cache')
      .update({ solution: sol.solution, date_solved: sol.date_solved, updated_at: new Date().toISOString() })
      .eq('ticket_id', tid).eq('instance', inst),
  ))
  log(inst, `backfill solutions: ${map.size} atualizados`)
  return newToken
}

// =============================================================================
// SYNC DE UMA INSTÂNCIA
// =============================================================================

async function syncInstance(
  sb: ReturnType<typeof createClient>,
  inst: InstanceName,
  opts: { mode: 'missing' | 'full' | 'incremental'; reset: boolean; sinceOverride?: Date },
): Promise<Record<string, unknown>> {
  const t0 = Date.now()
  log(inst, `START mode=${opts.mode} reset=${opts.reset}`)

  if (opts.reset) {
    log(inst, 'reset: limpando tickets_cache e sync_control')
    await sb.from('tickets_cache').delete().eq('instance', inst)
    await sb.from('sync_control').delete().eq('instance', inst)
  }

  const { data: ctrl } = await sb.from('sync_control').select('status,last_sync').eq('instance', inst).maybeSingle()
  const { count } = await sb.from('tickets_cache').select('*', { count: 'exact', head: true }).eq('instance', inst)
  const isEmpty = count === 0
  log(inst, `ctrl.status=${ctrl?.status ?? 'novo'} cache_count=${count} empty=${isEmpty}`)

  let effectiveMode: 'full' | 'incremental'
  if (opts.mode === 'full') {
    effectiveMode = 'full'
  } else if (opts.mode === 'incremental') {
    effectiveMode = 'incremental'
  } else {
    // missing: escolhe full se vazio, incremental se já há dados
    effectiveMode = isEmpty ? 'full' : 'incremental'
    log(inst, `missing: cache ${isEmpty ? 'vazio → full' : 'existente → incremental'}`)
  }

  const logEntry = await sb.from('sync_logs')
    .insert({ instance: inst, status: 'running', started_at: new Date().toISOString() })
    .select('id').single()
  const logId = logEntry.data?.id ?? null

  await sb.from('sync_control').upsert(
    { instance: inst, status: 'running', updated_at: new Date().toISOString() },
    { onConflict: 'instance' },
  )

  let token = await initSession(inst)
  let all: TD[] = []
  let totalProcessed = 0

  try {
    if (effectiveMode === 'full') {
      log(inst, 'full sync: paginação por offset iniciada')
      const first = await fetchPage(inst, searchUrl(inst, 0), token)
      token = first.token
      const grandTotal = first.total
      log(inst, `total no GLPI: ${grandTotal}`)

      if (grandTotal > 0) {
        all.push(...processRows(first.data, inst))
        totalProcessed += first.data.length
        const totalPages = Math.ceil(grandTotal / PAGE_SIZE)

        for (let page = 1; page < totalPages; page++) {
          const res = await fetchPage(inst, searchUrl(inst, page * PAGE_SIZE), token)
          token = res.token
          all.push(...processRows(res.data, inst))
          totalProcessed += res.data.length
          if (all.length >= BATCH_SIZE) {
            await upsert(sb, inst, all.splice(0, BATCH_SIZE), false)
            log(inst, `progress: ${totalProcessed}/${grandTotal}`)
          }
          if (page % 20 === 0) log(inst, `pág ${page}/${totalPages} total=${totalProcessed}`)
          await sleep(200)
        }
      }
      if (all.length > 0) { await upsert(sb, inst, all, false); all = [] }
      log(inst, `full concluído: ${totalProcessed} tickets`)

    } else {
      // ── INCREMENTAL ────────────────────────────────────────────────────────
      const baseDate: Date = opts.sinceOverride
        ?? (ctrl?.last_sync
          ? new Date(new Date(ctrl.last_sync).getTime() - INCREMENTAL_WINDOW * 60000)
          : new Date(Date.now() - INCREMENTAL_WINDOW * 60000))

      const since = toGlpiLocalTime(baseDate)
      log(inst, `incremental desde (UTC-3): ${since}${opts.sinceOverride ? ' [override]' : ''}`)

      const first = await fetchPage(inst, searchUrl(inst, 0, since), token)
      token = first.token
      const grandTotal = first.total
      const totalPages = Math.ceil(grandTotal / PAGE_SIZE)
      log(inst, `incremental: ${grandTotal} tickets alterados, ${totalPages} páginas`)

      if (grandTotal > 0) {
        all.push(...processRows(first.data, inst))
        for (let page = 1; page < totalPages; page++) {
          const res = await fetchPage(inst, searchUrl(inst, page * PAGE_SIZE, since), token)
          token = res.token
          if (!res.data.length) break
          all.push(...processRows(res.data, inst))
          if (res.data.length < PAGE_SIZE) break
          await sleep(200)
        }
      }

      if (all.length > 0) {
        log(inst, `enriquecendo ${all.length} tickets`)
        // Complementa técnicos que o search retornou vazios
        const techRes = await fetchTechs(inst, all.filter(t => !t.technician), token)
        token = techRes.token
        all.forEach(t => {
          const tech = techRes.map.get(t.ticket_id)
          if (tech) { t.technician = tech.name; t.technician_id = tech.id }
        })
        const solRes = await fetchSols(inst, all, token)
        token = solRes.token
        all.forEach(t => {
          const sol = solRes.map.get(t.ticket_id)
          if (sol) { t.solution = sol.solution; if (sol.date_solved) t.date_solved = sol.date_solved }
        })
        await upsert(sb, inst, all, true)
        totalProcessed = all.length
      }

      token = await backfillTechs(sb, inst, token)
      token = await backfillSols(sb, inst, token)
    }

    await sb.from('sync_control').upsert({
      instance: inst, last_sync: new Date().toISOString(),
      status: 'success', tickets_count: totalProcessed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'instance' })

    if (logId) {
      await sb.from('sync_logs').update({
        status: 'success', finished_at: new Date().toISOString(),
        tickets_processed: totalProcessed, tickets_added: totalProcessed,
      }).eq('id', logId)
    }

    log(inst, `DONE mode=${effectiveMode} total=${totalProcessed} duration=${Date.now() - t0}ms`)
    return { success: true, instance: inst, mode: effectiveMode, count: totalProcessed, duration_ms: Date.now() - t0 }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logErr(inst, 'syncInstance FALHOU', err)
    await sb.from('sync_control').upsert(
      { instance: inst, status: 'error', error_message: msg, updated_at: new Date().toISOString() },
      { onConflict: 'instance' },
    )
    if (logId) {
      await sb.from('sync_logs').update({
        status: 'error', finished_at: new Date().toISOString(),
        error_message: msg, tickets_processed: totalProcessed,
      }).eq('id', logId)
    }
    return { success: false, instance: inst, error: msg, duration_ms: Date.now() - t0 }

  } finally {
    await killSession(inst, token)
  }
}

// =============================================================================
// HTTP HANDLER
// =============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  log('http', `${req.method} ${req.url}`)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    let body: any = {}
    try { body = await req.json() } catch { /* cron envia body vazio */ }

    const rawInst = (body.instance ?? new URL(req.url).searchParams.get('instance') ?? 'ALL').toUpperCase()
    const rawMode = (body.mode     ?? new URL(req.url).searchParams.get('mode')     ?? 'missing').toLowerCase()
    const reset   = Boolean(body.reset)

    const rawSince = body.since ?? new URL(req.url).searchParams.get('since') ?? null
    let sinceOverride: Date | undefined
    if (rawSince) {
      const parsed = new Date(rawSince)
      if (!Number.isNaN(parsed.getTime())) {
        sinceOverride = parsed
        log('http', `since override: ${rawSince} → ${parsed.toISOString()}`)
      } else {
        log('http', `since inválido ignorado: ${rawSince}`)
      }
    }

    const targets: InstanceName[] = rawInst === 'ALL' ? ['PETA', 'GMX'] : [rawInst as InstanceName]
    const mode = (['missing', 'full', 'incremental'].includes(rawMode) ? rawMode : 'missing') as 'missing' | 'full' | 'incremental'

    log('http', `targets=${targets.join(',')} mode=${mode} reset=${reset}`)

    const results = []
    for (const inst of targets) {
      results.push(await syncInstance(sb, inst, { mode, reset, sinceOverride }))
    }

    return new Response(JSON.stringify({ ok: true, results }, null, 2), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    logErr('http', 'handler falhou', err)
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
