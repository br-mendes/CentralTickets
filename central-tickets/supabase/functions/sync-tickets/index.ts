// Supabase Edge Function para sincronização de tickets
// Agendar via: Supabase Dashboard > Edge Functions > Schedules
// Schedule: Every 3 hours

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GLPI_INSTANCES = {
  PETA: {
    BASE_URL: Deno.env.get('GLPI_PETA_URL')!,
    USER_TOKEN: Deno.env.get('GLPI_PETA_USER_TOKEN')!,
    APP_TOKEN: Deno.env.get('GLPI_PETA_APP_TOKEN')!,
  },
  GMX: {
    BASE_URL: Deno.env.get('GLPI_GMX_URL')!,
    USER_TOKEN: Deno.env.get('GLPI_GMX_USER_TOKEN')!,
    APP_TOKEN: Deno.env.get('GLPI_GMX_APP_TOKEN')!,
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface TicketData {
  id: number
  ticket_id: number
  title: string
  entity: string
  entity_full: string
  category: string
  root_category: string
  status_id: number
  status_key: string
  status_name: string
  group_name: string
  date_created: string | null
  date_mod: string | null
  due_date: string | null
  is_sla_late: boolean
  instance: string
}

async function initSession(instance: typeof GLPI_INSTANCES.PETA | typeof GLPI_INSTANCES.GMX) {
  const response = await fetch(`${instance.BASE_URL}/initSession/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `user_token ${instance.USER_TOKEN}`,
      'App-Token': instance.APP_TOKEN,
    },
  })
  if (!response.ok) throw new Error(`Erro ao iniciar sessão`)
  const data = await response.json()
  return data.session_token
}

async function getAllTickets(instance: typeof GLPI_INSTANCES.PETA | typeof GLPI_INSTANCES.GMX, sessionToken: string) {
  const allTickets: any[] = []
  let page = 0
  const pageSize = 100

  while (true) {
    const start = page * pageSize
    const end = start + pageSize - 1

    const searchParams = new URLSearchParams({
      'range': `${start}-${end}`,
      'expand_dropdowns': 'true',
      'get_hateoas': 'false',
    })

    const response = await fetch(
      `${instance.BASE_URL}/search/Ticket/?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Session-Token': sessionToken,
          'App-Token': instance.APP_TOKEN,
        },
      }
    )

    if (!response.ok) {
      if (response.status === 401) {
        sessionToken = await initSession(instance)
        continue
      }
      throw new Error(`Erro na busca: ${response.status}`)
    }

    const data = await response.json()
    if (!data.data || data.data.length === 0) break

    allTickets.push(...data.data)
    page++
    if (page >= 100) break
  }

  return allTickets
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

function getRootCategory(category: string): string {
  if (!category) return 'Não categorizado'
  const parts = category.split(' > ')
  return parts[0].trim()
}

function getStatusKey(statusId: number): string {
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

function getStatusName(statusId: number): string {
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

function checkSlaLate(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

function processTickets(tickets: any[], instanceName: string): TicketData[] {
  return tickets.map(ticket => {
    const statusId = parseInt(ticket[12]) || 1
    const entityFull = ticket[80] || ''
    const dateCreated = ticket.date_creation || ticket[15] || ticket.date
    const dateMod = ticket.date_mod || ticket[19] || ticket[91] || dateCreated
    const dueDate = ticket[151]

    return {
      id: 0,
      ticket_id: parseInt(ticket[2]) || ticket.id,
      title: ticket[1] || 'Sem título',
      entity: processEntity(entityFull, instanceName),
      entity_full: entityFull,
      category: ticket[7] || 'Não categorizado',
      root_category: getRootCategory(ticket[7]),
      status_id: statusId,
      status_key: getStatusKey(statusId),
      status_name: getStatusName(statusId),
      group_name: ticket[8] || 'Não atribuído',
      date_created: dateCreated,
      date_mod: dateMod,
      due_date: dueDate,
      is_sla_late: checkSlaLate(dueDate),
      instance: instanceName
    }
  })
}

async function syncInstance(instanceName: 'PETA' | 'GMX') {
  const instance = GLPI_INSTANCES[instanceName]
  
  console.log(`Iniciando sincronização de ${instanceName}...`)
  
  try {
    const sessionToken = await initSession(instance)
    const rawTickets = await getAllTickets(instance, sessionToken)
    const tickets = processTickets(rawTickets, instanceName)
    
    console.log(`${instanceName}: ${tickets.length} tickets processados`)
    
    // Upsert tickets
    for (const ticket of tickets) {
      const { error } = await supabase
        .from('tickets_cache')
        .upsert({
          ticket_id: ticket.ticket_id,
          instance: ticket.instance,
          title: ticket.title,
          entity: ticket.entity,
          entity_full: ticket.entity_full,
          category: ticket.category,
          root_category: ticket.root_category,
          status_id: ticket.status_id,
          status_key: ticket.status_key,
          status_name: ticket.status_name,
          group_name: ticket.group_name,
          date_created: ticket.date_created,
          date_mod: ticket.date_mod,
          due_date: ticket.due_date,
          is_sla_late: ticket.is_sla_late,
          last_sync: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'ticket_id,instance'
        })
      
      if (error) {
        console.error(`Erro ao salvar ticket ${ticket.ticket_id}:`, error)
      }
    }
    
    // Atualizar controle de sincronização
    await supabase
      .from('sync_control')
      .upsert({
        instance: instanceName,
        last_sync: new Date().toISOString(),
        status: 'success',
        tickets_count: tickets.length,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'instance'
      })
    
    console.log(`${instanceName}: Sincronização concluída com sucesso`)
    return { success: true, count: tickets.length }
    
  } catch (error) {
    console.error(`${instanceName}: Erro na sincronização:`, error)
    
    await supabase
      .from('sync_control')
      .upsert({
        instance: instanceName,
        status: 'failed',
        error_message: error.message,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'instance'
      })
    
    return { success: false, error: error.message }
  }
}

Deno.serve(async (req) => {
  console.log('Iniciando job de sincronização...')
  
  const startTime = Date.now()
  
  try {
    const [petaResult, gmxResult] = await Promise.all([
      syncInstance('PETA'),
      syncInstance('GMX')
    ])
    
    const duration = Date.now() - startTime
    
    // Log final
    await supabase
      .from('sync_logs')
      .insert({
        instance: 'ALL',
        finished_at: new Date().toISOString(),
        status: (petaResult.success && gmxResult.success) ? 'success' : 'partial',
        tickets_processed: (petaResult.count || 0) + (gmxResult.count || 0),
        error_message: !petaResult.success ? petaResult.error : (!gmxResult.success ? gmxResult.error : null)
      })
    
    return new Response(
      JSON.stringify({
        success: true,
        results: { peta: petaResult, gmx: gmxResult },
        duration_ms: duration
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Erro geral:', error)
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
