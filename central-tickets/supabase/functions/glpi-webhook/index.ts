// Supabase Edge Function — GLPI Webhook receiver
// Handles: ticket events, solution events, approval/validation events, followup events
//
// Required query param:  ?instance=PETA  or  ?instance=GMX
// Optional secret check: env vars WEBHOOK_SECRET_PETA / WEBHOOK_SECRET_GMX
//   validated against header  x-glpi-token  or  authorization

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-glpi-token, authorization',
}

// ── Normalisation helpers ─────────────────────────────────────────────────────

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

function norm(value: string | null | undefined, instance: string): string | null {
  if (!value) return null
  let s = value.trim()
  for (const re of (STRIP[instance] ?? [])) {
    const replaced = s.replace(re, '')
    if (replaced !== s) { s = replaced.trim(); break }
  }
  return s || null
}

/** Last segment after " > " or the whole string */
function lastSegment(value: string | null | undefined): string | null {
  if (!value) return null
  const parts = value.split(/\s*>\s*/)
  return parts[parts.length - 1].trim() || null
}

// ── Field parsers ─────────────────────────────────────────────────────────────

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null
}

function parseIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = parseInt(String(value), 10)
  return isNaN(n) ? null : n
}

function parseIntOrDefault(value: unknown, def: number): number {
  return parseIntOrNull(value) ?? def
}

function parseDate(value: unknown): string | null {
  if (!value) return null
  const s = String(value).trim()
  if (s === '' || s.startsWith('0000')) return null
  return s
}

function isSlaLate(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

// ── Status mapping (global_validation overrides status) ───────────────────────

function getStatusKey(statusId: number, globalValidation: number): string {
  if (globalValidation === 2 && statusId !== 5 && statusId !== 6) return 'pending-approval'
  switch (statusId) {
    case 1: return 'new'
    case 2:
    case 3: return 'processing'
    case 4: return 'pending'
    case 5: return 'solved'
    case 6: return 'closed'
    default: return 'new'
  }
}

function getStatusName(statusId: number, globalValidation: number): string {
  if (globalValidation === 2 && statusId !== 5 && statusId !== 6) return 'Aprovação'
  switch (statusId) {
    case 1: return 'Novo'
    case 2:
    case 3: return 'Em atendimento'
    case 4: return 'Pendente'
    case 5: return 'Solucionado'
    case 6: return 'Fechado'
    default: return 'Novo'
  }
}

function getRootCategory(category: string | null | undefined): string {
  if (!category) return 'Não categorizado'
  return category.split(' > ')[0].trim() || 'Não categorizado'
}

// ── Response factories ────────────────────────────────────────────────────────

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  )
}

function jsonOk(body: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ success: true, ...body }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  )
}

// ── Event detectors ───────────────────────────────────────────────────────────

/**
 * Detect event category from payload.
 * Priority: explicit event name > payload field presence.
 */
function detectEventType(event: string, item: Record<string, unknown>): 'ticket' | 'solution' | 'approval' | 'followup' | 'unknown' {
  const ev = event.toLowerCase()

  // Explicit event name matching
  if (ev.includes('validation') || ev.includes('approval')) return 'approval'
  if (ev.includes('solution') || ev.includes('itiilsolution')) return 'solution'
  if (ev.includes('followup') || ev.includes('itilfollowup')) return 'followup'
  if (ev.includes('ticket')) return 'ticket'

  // Fallback: field presence detection
  if ('tickets_id' in item) return 'approval'
  if ('items_id' in item && item.type !== undefined && typeof item.type === 'object' && item.type !== null) return 'solution'
  if ('items_id' in item && 'is_private' in item) return 'followup'
  if ('id' in item) return 'ticket'

  return 'unknown'
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleTicket(
  item: Record<string, unknown>,
  event: string,
  instance: string,
): Promise<Response> {
  const rawTicketId = parseIntOrNull(item.id)
  if (!rawTicketId) return jsonError('Missing or invalid item.id', 400)

  console.log(`[${instance}] TICKET event=${event} id=${rawTicketId}`)

  const isDeleted = event === 'ticket_delete' || String(item.is_deleted) === '1'

  const statusObj        = (item.status ?? {}) as Record<string, unknown>
  const statusId         = parseIntOrDefault(statusObj.id ?? item.status, 1)
  const globalValidation = parseIntOrDefault(item.global_validation ?? item[55], 1)

  const entityObj     = (item.entity ?? {}) as Record<string, unknown>
  const entityFull    = String(entityObj.completename ?? entityObj.name ?? '')
  const entityCleaned = norm(entityFull, instance)

  const categoryObj  = (item.category ?? {}) as Record<string, unknown>
  const categoryName = String(categoryObj.name ?? '')

  const locationObj  = (item.location ?? {}) as Record<string, unknown>
  const locationName = locationObj.name ? String(locationObj.name) : null

  const requesterObj  = (item.user_recipient ?? {}) as Record<string, unknown>
  const requesterName = requesterObj.name ? String(requesterObj.name) : null
  const requesterId   = parseIntOrDefault(requesterObj.id, 0)

  const requestTypeObj  = (item.request_type ?? {}) as Record<string, unknown>
  const requestTypeName = requestTypeObj.name ? String(requestTypeObj.name) : null

  const slaTtrObj  = (item.sla_ttr ?? {}) as Record<string, unknown>
  const slaTtoObj  = (item.sla_tto ?? {}) as Record<string, unknown>

  const dateCreated         = parseDate(item.date_creation ?? item.date)
  const dateMod             = parseDate(item.date_mod)
  const dueDate             = parseDate(item.resolution_date)
  const dateSolve           = parseDate(item.date_solve)
  const dateClose           = parseDate(item.date_close)
  const takeIntoAccountDate = parseDate(item.take_into_account_date)

  const isSlaLateFlag    = isSlaLate(dueDate)
  const isOverdueResolve = isSlaLate(dateSolve ?? dueDate)

  const urgency            = parseIntOrDefault(item.urgency, 3)
  const impact             = parseIntOrDefault(item.impact, 3)
  const priorityId         = parseIntOrDefault(item.priority, 3)
  const waitingDuration    = parseIntOrDefault(item.waiting_duration, 0)
  const resolutionDuration = parseIntOrDefault(item.resolution_duration, 0)
  const typeId             = parseIntOrDefault(item.type, 2)

  const content  = stripHtml(item.content as string | null)
  const solution = stripHtml(item.solution as string | null)

  // Normalise team — may be array of objects or a JSON string
  let team: string | null = null
  if (item.team !== undefined) {
    team = typeof item.team === 'string' ? item.team : JSON.stringify(item.team)
  }

  // Extract technician name from team array
  let technician: string | null = null
  if (item.team && Array.isArray(item.team)) {
    const tech = (item.team as Record<string, unknown>[]).find(
      m => String(m.type ?? '').toLowerCase().includes('tech') || m.type === 'User'
    )
    if (tech) technician = tech.name ? String(tech.name) : null
  }

  const record: Record<string, unknown> = {
    ticket_id:              rawTicketId,
    instance,
    title:                  item.name ? String(item.name) : null,
    content,
    entity:                 entityCleaned,
    entity_full:            entityFull || null,
    category:               categoryName || null,
    root_category:          getRootCategory(categoryName),
    status_id:              statusId,
    status_key:             getStatusKey(statusId, globalValidation),
    status_name:            getStatusName(statusId, globalValidation),
    global_validation:      globalValidation === 2,
    type_id:                typeId,
    priority_id:            priorityId,
    urgency,
    impact,
    requester:              requesterName,
    requester_id:           requesterId,
    location:               locationName ? norm(locationName, instance) : null,
    request_type:           requestTypeName,
    sla_ttr_name:           slaTtrObj.name ? String(slaTtrObj.name) : null,
    sla_tto_name:           slaTtoObj.name ? String(slaTtoObj.name) : null,
    group_name:             team,
    date_created:           dateCreated,
    date_mod:               dateMod,
    due_date:               dueDate,
    date_solved:            dateSolve,
    date_close:             dateClose,
    take_into_account_date: takeIntoAccountDate,
    waiting_duration:       waitingDuration,
    resolution_duration:    resolutionDuration,
    is_sla_late:            isSlaLateFlag,
    is_overdue_resolve:     isOverdueResolve,
    is_deleted:             isDeleted,
    last_sync:              new Date().toISOString(),
    updated_at:             new Date().toISOString(),
  }

  if (solution !== null) record.solution = solution
  if (technician !== null) record.technician = technician

  const { error } = await supabase
    .from('tickets_cache')
    .upsert(record, { onConflict: 'ticket_id,instance' })

  if (error) {
    console.error(`[${instance}] Ticket upsert error id=${rawTicketId}:`, error)
    return jsonError(`Database error: ${error.message}`, 500)
  }

  return jsonOk({ event, ticketId: rawTicketId, instance, isDeleted })
}

async function handleSolution(
  item: Record<string, unknown>,
  event: string,
  instance: string,
): Promise<Response> {
  // Solution payload: item.items_id = ticket ID
  const ticketId = parseIntOrNull(item.items_id ?? item.tickets_id ?? item.id)
  if (!ticketId) return jsonError('Missing ticket ID in solution payload', 400)

  console.log(`[${instance}] SOLUTION event=${event} ticket=${ticketId}`)

  const solution  = stripHtml(item.content as string | null)
  const dateSolve = parseDate(item.date_creation ?? item.date_mod)

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    last_sync:  new Date().toISOString(),
  }

  if (solution !== null) update.solution = solution
  if (dateSolve)         update.date_solved = dateSolve

  // Mark ticket as solved unless it's already closed
  // We'll let the ticket event handle full status; here just set date_solved + solution
  const { error } = await supabase
    .from('tickets_cache')
    .update(update)
    .eq('ticket_id', ticketId)
    .eq('instance', instance)

  if (error) {
    console.error(`[${instance}] Solution update error ticket=${ticketId}:`, error)
    return jsonError(`Database error: ${error.message}`, 500)
  }

  return jsonOk({ event, ticketId, instance, updated: Object.keys(update) })
}

async function handleApproval(
  item: Record<string, unknown>,
  event: string,
  instance: string,
): Promise<Response> {
  // Approval payload: item.tickets_id = ticket ID
  const ticketId = parseIntOrNull(item.tickets_id ?? item.id)
  if (!ticketId) return jsonError('Missing ticket ID in approval payload', 400)

  // item.status: "2"=waiting, "3"=accepted, "4"=refused, "5"=closed
  const approvalStatus = parseIntOrDefault(item.status, 1)

  console.log(`[${instance}] APPROVAL event=${event} ticket=${ticketId} status=${approvalStatus}`)

  // Fetch current ticket to get its status_id so we can re-compute status_key
  const { data: current, error: fetchErr } = await supabase
    .from('tickets_cache')
    .select('status_id')
    .eq('ticket_id', ticketId)
    .eq('instance', instance)
    .maybeSingle()

  if (fetchErr) {
    console.error(`[${instance}] Approval fetch error ticket=${ticketId}:`, fetchErr)
    return jsonError(`Database error: ${fetchErr.message}`, 500)
  }

  const statusId = (current?.status_id ?? 1) as number
  const newStatusKey  = getStatusKey(statusId, approvalStatus)
  const newStatusName = getStatusName(statusId, approvalStatus)

  const { error } = await supabase
    .from('tickets_cache')
    .update({
      global_validation: approvalStatus === 2,
      status_key:        newStatusKey,
      status_name:       newStatusName,
      updated_at:        new Date().toISOString(),
      last_sync:         new Date().toISOString(),
    })
    .eq('ticket_id', ticketId)
    .eq('instance', instance)

  if (error) {
    console.error(`[${instance}] Approval update error ticket=${ticketId}:`, error)
    return jsonError(`Database error: ${error.message}`, 500)
  }

  return jsonOk({ event, ticketId, instance, approvalStatus, newStatusKey })
}

async function handleFollowup(
  item: Record<string, unknown>,
  event: string,
  instance: string,
): Promise<Response> {
  // Followup payload: item.items_id = ticket ID
  const ticketId = parseIntOrNull(item.items_id ?? item.id)
  if (!ticketId) return jsonError('Missing ticket ID in followup payload', 400)

  console.log(`[${instance}] FOLLOWUP event=${event} ticket=${ticketId}`)

  const dateMod = parseDate(item.date_mod ?? item.date_creation)

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    last_sync:  new Date().toISOString(),
  }

  if (dateMod) update.date_mod = dateMod

  const { error } = await supabase
    .from('tickets_cache')
    .update(update)
    .eq('ticket_id', ticketId)
    .eq('instance', instance)

  if (error) {
    console.error(`[${instance}] Followup update error ticket=${ticketId}:`, error)
    return jsonError(`Database error: ${error.message}`, 500)
  }

  return jsonOk({ event, ticketId, instance })
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  // ── 1. Instance from query param ─────────────────────────────────────────────

  const url      = new URL(req.url)
  const instance = url.searchParams.get('instance')?.toUpperCase()

  if (!instance || (instance !== 'PETA' && instance !== 'GMX')) {
    return jsonError('Missing or invalid ?instance= query parameter (use PETA or GMX)', 400)
  }

  // ── 2. Optional secret validation ────────────────────────────────────────────

  const expectedSecret = Deno.env.get(`WEBHOOK_SECRET_${instance}`) ?? ''
  if (expectedSecret !== '') {
    const providedToken =
      req.headers.get('x-glpi-token') ??
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      ''
    if (providedToken !== expectedSecret) {
      console.warn(`[${instance}] Invalid webhook secret`)
      return jsonError('Unauthorized', 401)
    }
  }

  // ── 3. Parse payload ──────────────────────────────────────────────────────────

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const event = String(payload.event ?? '')
  const item  = (payload.item ?? {}) as Record<string, unknown>

  // ── 4. Route to handler ───────────────────────────────────────────────────────

  const eventType = detectEventType(event, item)
  console.log(`[${instance}] Incoming event="${event}" → type="${eventType}"`)

  switch (eventType) {
    case 'ticket':   return handleTicket(item, event, instance)
    case 'solution': return handleSolution(item, event, instance)
    case 'approval': return handleApproval(item, event, instance)
    case 'followup': return handleFollowup(item, event, instance)
    default:
      console.warn(`[${instance}] Unknown event type for event="${event}"`)
      return jsonOk({ event, instance, skipped: true, reason: 'unrecognised event type' })
  }
})
