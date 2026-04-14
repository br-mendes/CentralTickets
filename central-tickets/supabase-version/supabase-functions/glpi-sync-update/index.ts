// Edge Function for updating existing tickets in Supabase
// Deploy: supabase functions deploy glpi-sync-update
// Usage: 
//   - /functions/v1/glpi-sync-update?mode=active     (update open tickets)
//   - /functions/v1/glpi-sync-update?mode=technicians (update missing technicians)
//   - /functions/v1/glpi-sync-update?mode=full       (full update)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GLPI_CONFIG = {
  PETA: {
    url: Deno.env.get('GLPI_PETA_URL') || 'https://glpi.petacorp.com.br/apirest.php',
    userToken: Deno.env.get('GLPI_PETA_USER_TOKEN') || '',
    appToken: Deno.env.get('GLPI_PETA_APP_TOKEN') || '',
  },
  GMX: {
    url: Deno.env.get('GLPI_GMX_URL') || 'https://glpi.gmxtecnologia.com.br/apirest.php',
    userToken: Deno.env.get('GLPI_GMX_USER_TOKEN') || '',
    appToken: Deno.env.get('GLPI_GMX_APP_TOKEN') || '',
  }
}

const MAX_PER_RUN = 50
const REQUEST_DELAY = 100

interface SyncResult {
  processed: number
  updated: number
  failed: number
}

// Import Supabase client
const { createClient } = await import('npm:@supabase/supabase-js@2')
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusKey(id: number): string {
  switch (id) {
    case 1: return 'new'
    case 2: case 3: return 'processing'
    case 4: return 'pending'
    case 5: return 'solved'
    case 6: return 'closed'
    case 7: return 'pending-approval'
    default: return 'new'
  }
}

function getStatusName(id: number): string {
  switch (id) {
    case 1: return 'Novo'
    case 2: return 'Em atendimento (atribuído)'
    case 3: return 'Em atendimento (planejado)'
    case 4: return 'Pendente'
    case 5: return 'Solucionado'
    case 6: return 'Fechado'
    case 7: return 'Aprovação pendente'
    default: return 'Novo'
  }
}

function getPriorityLabel(id: number): string {
  switch (id) {
    case 1: return '1-Baixa'
    case 2: return '2-Média'
    case 3: return '3-Alta'
    case 4: return '4-Urgente'
    case 5: return '5-Crítica'
    default: return '1-Baixa'
  }
}

function getRootCategory(cat: string): string {
  if (!cat) return 'Não categorizado'
  return cat.split(' > ')[0].trim()
}

function processEntity(entityFull: string, instanceName: string): string {
  if (!entityFull) return entityFull
  if (instanceName === 'PETA') {
    return entityFull.replace(/^PETA\s*GRUPO\s*>\s*/gi, '').trim()
  } else if (instanceName === 'GMX') {
    return entityFull.replace(/^GMX\s*TECNOLOGIA\s*>\s*/gi, '').trim()
  }
  return entityFull
}

async function initSession(config: { url: string, userToken: string, appToken: string }): Promise<string> {
  const res = await fetch(`${config.url}/initSession`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `user_token ${config.userToken}`,
      'App-Token': config.appToken,
    },
  })
  if (!res.ok) throw new Error(`initSession failed: ${res.status}`)
  const data = await res.json()
  return data.session_token
}

async function fetchTicket(ticketId: number, config: { url: string }, session: string, appToken: string) {
  try {
    const res = await fetch(`${config.url}/Ticket/${ticketId}?expand_dropdowns=true`, {
      headers: {
        'Content-Type': 'application/json',
        'Session-Token': session,
        'App-Token': appToken,
      },
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

async function fetchTechnician(ticketId: number, config: { url: string }, session: string, appToken: string) {
  try {
    const actorsRes = await fetch(`${config.url}/Ticket/${ticketId}/Ticket_User`, {
      headers: {
        'Content-Type': 'application/json',
        'Session-Token': session,
        'App-Token': appToken,
      },
    })
    if (!actorsRes.ok) return null
    
    const actors = await actorsRes.json()
    if (!Array.isArray(actors)) return null
    
    const tech = actors.find((a: any) => a.type === 2)
    if (!tech?.users_id) return null
    
    const userRes = await fetch(`${config.url}/User/${tech.users_id}`, {
      headers: {
        'Content-Type': 'application/json',
        'Session-Token': session,
        'App-Token': appToken,
      },
    })
    
    if (!userRes.ok) {
      return { name: String(tech.users_id), id: Number(tech.users_id) }
    }
    
    const u = await userRes.json()
    const name = (u.firstname && u.realname) ? `${u.firstname} ${u.realname}` 
               : u.firstname ?? u.realname ?? u.name ?? String(tech.users_id)
    
    return { name, id: Number(tech.users_id) }
  } catch {
    return null
  }
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── Sync Modes ───────────────────────────────────────────────────────────────

async function syncActive(instanceName: string): Promise<SyncResult> {
  const config = GLPI_CONFIG[instanceName as keyof typeof GLPI_CONFIG]
  if (!config.userToken) return { processed: 0, updated: 0, failed: 0 }
  
  console.log(`[${instanceName}] syncActive: fetching open tickets...`)
  
  const { data: tickets, error } = await supabase
    .from('tickets_cache')
    .select('ticket_id')
    .eq('instance', instanceName)
    .not('status_key', 'in', '("closed","solved")')
    .limit(MAX_PER_RUN)
  
  if (error || !tickets?.length) {
    console.log(`[${instanceName}] No open tickets found`)
    return { processed: 0, updated: 0, failed: 0 }
  }
  
  const session = await initSession(config)
  let updated = 0, failed = 0
  
  for (const { ticket_id } of tickets) {
    const ticketData = await fetchTicket(ticket_id, config, session, config.appToken)
    if (!ticketData) { failed++; continue }
    
    const statusId = Number(ticketData.status) || 1
    const tech = await fetchTechnician(ticket_id, config, session, config.appToken)
    
    const entityFull = (ticketData.entities?.completename as string) ?? (ticketData.entity?.completename as string) ?? ''
    const entity = processEntity(entityFull, instanceName)
    const groupName = ticketData.groups_id_assign?.name ?? ticketData.groups?.name ?? ''
    
    const payload: Record<string, any> = {
      entity: entity,
      entity_full: entityFull,
      category: ticketData.itilcategories?.name ?? 'Não categorizado',
      status_id: statusId,
      status_key: getStatusKey(statusId),
      status_name: getStatusName(statusId),
      group_name: groupName,
      date_mod: ticketData.date_mod ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    if (tech) {
      payload.technician = tech.name
      payload.technician_id = tech.id
    }
    
    const { error: upErr } = await supabase
      .from('tickets_cache')
      .update(payload)
      .eq('ticket_id', ticket_id)
      .eq('instance', instanceName)
    
    upErr ? failed++ : updated++
    await delay(REQUEST_DELAY)
  }
  
  console.log(`[${instanceName}] syncActive: updated=${updated}, failed=${failed}`)
  return { processed: tickets.length, updated, failed }
}

async function syncTechnicians(instanceName: string): Promise<SyncResult> {
  const config = GLPI_CONFIG[instanceName as keyof typeof GLPI_CONFIG]
  if (!config.userToken) return { processed: 0, updated: 0, failed: 0 }
  
  console.log(`[${instanceName}] syncTechnicians: fetching tickets without tech...`)
  
  const { data: tickets, error } = await supabase
    .from('tickets_cache')
    .select('ticket_id')
    .eq('instance', instanceName)
    .or('technician.is.null,technician.eq.')
    .limit(MAX_PER_RUN)
  
  if (error || !tickets?.length) {
    console.log(`[${instanceName}] No tickets without technician`)
    return { processed: 0, updated: 0, failed: 0 }
  }
  
  const session = await initSession(config)
  let updated = 0, failed = 0
  
  for (const { ticket_id } of tickets) {
    const tech = await fetchTechnician(ticket_id, config, session, config.appToken)
    
    if (tech?.id) {
      const { error: upErr } = await supabase
        .from('tickets_cache')
        .update({ 
          technician: tech.name, 
          technician_id: tech.id, 
          updated_at: new Date().toISOString() 
        })
        .eq('ticket_id', ticket_id)
        .eq('instance', instanceName)
      
      upErr ? failed++ : updated++
    } else {
      failed++
    }
    
    await delay(REQUEST_DELAY)
  }
  
  console.log(`[${instanceName}] syncTechnicians: updated=${updated}, failed=${failed}`)
  return { processed: tickets.length, updated, failed }
}

async function syncFull(instanceName: string): Promise<SyncResult> {
  const config = GLPI_CONFIG[instanceName as keyof typeof GLPI_CONFIG]
  if (!config.userToken) return { processed: 0, updated: 0, failed: 0 }
  
  console.log(`[${instanceName}] syncFull: fetching tickets...`)
  
  const { data: tickets, error } = await supabase
    .from('tickets_cache')
    .select('ticket_id')
    .eq('instance', instanceName)
    .order('date_mod', { ascending: false })
    .limit(MAX_PER_RUN)
  
  if (error || !tickets?.length) {
    console.log(`[${instanceName}] No tickets to sync`)
    return { processed: 0, updated: 0, failed: 0 }
  }
  
  const session = await initSession(config)
  let updated = 0, failed = 0
  
  for (const { ticket_id } of tickets) {
    const ticketData = await fetchTicket(ticket_id, config, session, config.appToken)
    if (!ticketData) { failed++; continue }
    
    const statusId = Number(ticketData.status) || 1
    const priorityId = Number(ticketData.urgency) || 1
    const tech = await fetchTechnician(ticket_id, config, session, config.appToken)
    
    const entityFull = (ticketData.entities?.completename as string) ?? (ticketData.entity?.completename as string) ?? ''
    const entity = processEntity(entityFull, instanceName)
    const category = ticketData.itilcategories?.name ?? ''
    const groupName = ticketData.groups_id_assign?.name ?? ''
    const dueDate = ticketData.time_to_resolve ?? null
    
    const payload: Record<string, any> = {
      title: ticketData.name ?? '',
      technician: tech?.name ?? '',
      technician_id: tech?.id ?? 0,
      entity: entity,
      entity_full: entityFull,
      category: category,
      root_category: getRootCategory(category),
      status_id: statusId,
      status_key: getStatusKey(statusId),
      status_name: getStatusName(statusId),
      priority_id: priorityId,
      priority: getPriorityLabel(priorityId),
      urgency: priorityId >= 4,
      group_name: groupName,
      date_created: ticketData.date_creation ?? null,
      date_mod: ticketData.date_mod ?? null,
      due_date: dueDate,
      is_sla_late: dueDate ? new Date(dueDate) < new Date() : false,
      last_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    const { error: upErr } = await supabase
      .from('tickets_cache')
      .update(payload)
      .eq('ticket_id', ticket_id)
      .eq('instance', instanceName)
    
    upErr ? failed++ : updated++
    await delay(REQUEST_DELAY)
  }
  
  console.log(`[${instanceName}] syncFull: updated=${updated}, failed=${failed}`)
  return { processed: tickets.length, updated, failed }
}

// ─── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const start = Date.now()
  console.log('🚀 GLPI Update Job Started')
  
  try {
    const url = new URL(req.url)
    const mode = url.searchParams.get('mode') ?? 'active'
    
    let instParam = url.searchParams.get('instance')
    let instances: string[] = []
    
    if (instParam) {
      const upper = instParam.toUpperCase()
      if (upper === 'PETA' || upper === 'GMX') {
        instances = [upper]
      }
    }
    
    if (!instances.length) {
      instances = ['PETA', 'GMX']
    }
    
    const syncFn: Record<string, (i: string) => Promise<SyncResult>> = {
      active: syncActive,
      technicians: syncTechnicians,
      full: syncFull,
    }
    
    if (!syncFn[mode]) {
      return new Response(
        JSON.stringify({ success: false, error: `Modo inválido: "${mode}". Use active | technicians | full` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }
    
    const results: Record<string, SyncResult> = {}
    for (const inst of instances) {
      results[inst.toLowerCase()] = await syncFn[mode](inst)
    }
    
    const totals = Object.values(results).reduce(
      (acc, r) => ({
        processed: acc.processed + r.processed,
        updated: acc.updated + r.updated,
        failed: acc.failed + r.failed,
      }),
      { processed: 0, updated: 0, failed: 0 },
    )
    
    console.log(`✅ Concluído em ${Date.now() - start}ms:`, totals)
    
    return new Response(
      JSON.stringify({ success: true, mode, results, ...totals, duration_ms: Date.now() - start }),
      { headers: { 'Content-Type': 'application/json' } },
    )
    
  } catch (err) {
    console.error('❌ Erro:', err.message)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})