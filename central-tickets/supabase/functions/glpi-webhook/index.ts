// Supabase Edge Function — GLPI Webhook receiver
// Receives GLPI webhook POST events and upserts to tickets_cache
//
// Required query param:  ?instance=PETA  or  ?instance=GMX
// Optional secret check: env vars WEBHOOK_SECRET_PETA / WEBHOOK_SECRET_GMX
//   validated against header  x-glpi-token  or  authorization
//   (skip check when env var is empty / not set)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Supabase client ───────────────────────────────────────────────────────────

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── CORS headers (returned on every response) ─────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-glpi-token, authorization',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Remove HTML tags and collapse whitespace */
function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null
}

/** Parse a string to integer; return null when falsy / NaN */
function parseIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = parseInt(String(value), 10)
  return isNaN(n) ? null : n
}

/** Parse a string to integer; return defaultValue when falsy / NaN */
function parseIntOrDefault(value: unknown, defaultValue: number): number {
  const n = parseIntOrNull(value)
  return n === null ? defaultValue : n
}

/** Return null for empty / '0000-00-00 00:00:00' GLPI date strings */
function parseDate(value: unknown): string | null {
  if (!value) return null
  const s = String(value).trim()
  if (s === '' || s.startsWith('0000')) return null
  return s
}

/** Convert GLPI status id to status_key string */
function getStatusKey(statusId: number): string {
  switch (statusId) {
    case 1:  return 'new'
    case 2:
    case 3:  return 'processing'
    case 4:  return 'pending'
    case 5:  return 'solved'
    case 6:  return 'closed'
    case 7:  return 'pending-approval'
    default: return 'new'
  }
}

/** Convert GLPI status id to human-readable name */
function getStatusName(statusId: number): string {
  switch (statusId) {
    case 1:  return 'Novo'
    case 2:
    case 3:  return 'Em atendimento'
    case 4:  return 'Pendente'
    case 5:  return 'Solucionado'
    case 6:  return 'Fechado'
    case 7:  return 'Aprovação'
    default: return 'Novo'
  }
}

/**
 * Strip known root-level prefixes from the entity completename.
 * "PETA GRUPO > Filial X"  →  "Filial X"
 * "GMX TECNOLOGIA > Área Y" →  "Área Y"
 */
function processEntity(completename: string | null | undefined, instance: string): string | null {
  if (!completename) return null
  let name = completename.trim()
  if (instance === 'PETA') {
    name = name.replace(/^PETA\s+GRUPO\s*>\s*/i, '')
  } else if (instance === 'GMX') {
    name = name.replace(/^GMX\s+TECNOLOGIA\s*>\s*/i, '')
  }
  return name.trim() || null
}

/** First segment before " > " in a hierarchical string */
function getRootCategory(category: string | null | undefined): string {
  if (!category) return 'Não categorizado'
  return category.split(' > ')[0].trim() || 'Não categorizado'
}

/** true when due_date is in the past */
function isSlaLate(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

// ── JSON error / success response factories ───────────────────────────────────

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

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  // ── 1. Resolve instance from query param ────────────────────────────────────

  const url      = new URL(req.url)
  const instance = url.searchParams.get('instance')?.toUpperCase()

  if (!instance || (instance !== 'PETA' && instance !== 'GMX')) {
    return jsonError('Missing or invalid ?instance= query parameter (use PETA or GMX)', 400)
  }

  // ── 2. Optional secret validation ───────────────────────────────────────────

  const secretEnvKey = `WEBHOOK_SECRET_${instance}`
  const expectedSecret = Deno.env.get(secretEnvKey) ?? ''

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

  // ── 3. Parse payload ─────────────────────────────────────────────────────────

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const event = String(payload.event ?? '')
  const item  = (payload.item ?? {}) as Record<string, unknown>

  const rawTicketId = parseIntOrNull(item.id)
  if (!rawTicketId) {
    return jsonError('Missing or invalid item.id in payload', 400)
  }

  console.log(`[${instance}] Event: ${event} | Ticket: ${rawTicketId}`)

  // ── 4. Soft-delete flag ──────────────────────────────────────────────────────

  const isDeleted = event === 'ticket_delete' || String(item.is_deleted) === '1'

  // ── 5. Extract and map all fields ────────────────────────────────────────────

  // Status
  const statusObj = (item.status ?? {}) as Record<string, unknown>
  const statusId  = parseIntOrDefault(statusObj.id, 1)

  // Entity
  const entityObj      = (item.entity ?? {}) as Record<string, unknown>
  const entityFull     = String(entityObj.completename ?? entityObj.name ?? '')
  const entityCleaned  = processEntity(entityFull, instance)

  // Category
  const categoryObj = (item.category ?? {}) as Record<string, unknown>
  const categoryName = String(categoryObj.name ?? '')

  // Location
  const locationObj  = (item.location ?? {}) as Record<string, unknown>
  const locationName = (locationObj.name ? String(locationObj.name) : null)

  // Requester
  const requesterObj = (item.user_recipient ?? {}) as Record<string, unknown>
  const requesterName = (requesterObj.name ? String(requesterObj.name) : null)
  const requesterId   = parseIntOrDefault(requesterObj.id, 0)

  // Request type (channel)
  const requestTypeObj  = (item.request_type ?? {}) as Record<string, unknown>
  const requestTypeName = (requestTypeObj.name ? String(requestTypeObj.name) : null)

  // SLA objects
  const slaTtrObj  = (item.sla_ttr ?? {}) as Record<string, unknown>
  const slaTtoObj  = (item.sla_tto ?? {}) as Record<string, unknown>
  const slaTtrName = (slaTtrObj.name ? String(slaTtrObj.name) : null)
  const slaTtoName = (slaTtoObj.name ? String(slaTtoObj.name) : null)

  // Dates
  const dateCreated           = parseDate(item.date_creation ?? item.date)
  const dateMod               = parseDate(item.date_mod)
  const dueDate               = parseDate(item.resolution_date)   // SLA TTR deadline
  const dateSolve             = parseDate(item.date_solve)
  const dateClose             = parseDate(item.date_close)
  const takeIntoAccountDate   = parseDate(item.take_into_account_date)

  // SLA lateness
  const isSlaLateFlag        = isSlaLate(dueDate)
  const isOverdueResolve     = isSlaLate(dateSolve ?? dueDate)

  // Numeric fields
  const urgency             = parseIntOrDefault(item.urgency, 3)
  const impact              = parseIntOrDefault(item.impact, 3)
  const priorityId          = parseIntOrDefault(item.priority, 3)
  const globalValidation    = parseIntOrDefault(item.global_validation, 1)
  const waitingDuration     = parseIntOrDefault(item.waiting_duration, 0)
  const resolutionDuration  = parseIntOrDefault(item.resolution_duration, 0)

  // Ticket type: 1=Incident, 2=Request
  const typeId = parseIntOrDefault(item.type, 2)

  // Content (strip HTML)
  const content  = stripHtml(item.content as string | null)

  // Solution (may already be in table from sync; only set if present in payload)
  const solution = stripHtml(item.solution as string | null)

  // Team stored as JSON string (preserve full structure)
  const team = item.team !== undefined ? JSON.stringify(item.team) : null

  // ── 6. Build upsert record ──────────────────────────────────────────────────

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
    status_key:             getStatusKey(statusId),
    status_name:            getStatusName(statusId),
    type_id:                typeId,
    priority_id:            priorityId,
    urgency,
    impact,
    global_validation:      globalValidation,
    requester:              requesterName,
    requester_id:           requesterId,
    location:               locationName,
    request_type:           requestTypeName,
    sla_ttr_name:           slaTtrName,
    sla_tto_name:           slaTtoName,
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

  // Include solution only when the payload actually carries it
  if (solution !== null) {
    record.solution = solution
  }

  // ── 7. Upsert to Supabase ────────────────────────────────────────────────────

  const { error } = await supabase
    .from('tickets_cache')
    .upsert(record, { onConflict: 'ticket_id,instance' })

  if (error) {
    console.error(`[${instance}] Upsert error for ticket ${rawTicketId}:`, error)
    return jsonError(`Database error: ${error.message}`, 500)
  }

  console.log(`[${instance}] Ticket ${rawTicketId} saved (event=${event}, deleted=${isDeleted})`)

  return jsonOk({
    event,
    ticketId:  rawTicketId,
    instance,
    isDeleted,
  })
})
