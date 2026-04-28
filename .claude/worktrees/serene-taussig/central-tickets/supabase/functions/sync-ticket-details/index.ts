// Supabase Edge Function para sincronização completa de tickets
// Atualiza todos os detalhes dos tickets: técnico, categoria, entidade, datas, etc.

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

const MAX_TICKETS_PER_RUN = 30 // Tickets para atualizar por execução

async function initSession(instance: typeof GLPI_INSTANCES.PETA | typeof GLPI_INSTANCES.GMX) {
  const url = `${instance.BASE_URL}/initSession`
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `user_token ${instance.USER_TOKEN}`,
      'App-Token': instance.APP_TOKEN,
    },
  })
  
  if (!response.ok) {
    throw new Error(`Erro initSession: ${response.status}`)
  }
  
  const data = await response.json()
  return data.session_token
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

function getRootCategory(category: string): string {
  if (!category) return 'Não categorizado'
  const parts = category.split(' > ')
  return parts[0].trim()
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

function checkSlaLate(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

async function getTicketDetailsFromGLPI(
  ticketId: number,
  instance: typeof GLPI_INSTANCES.PETA | typeof GLPI_INSTANCES.GMX,
  sessionToken: string
): Promise<any | null> {
  try {
    // 1. Get ticket details
    const ticketResponse = await fetch(
      `${instance.BASE_URL}/Ticket/${ticketId}?expand_dropdowns=true`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Session-Token': sessionToken,
          'App-Token': instance.APP_TOKEN,
        },
      }
    )
    
    if (!ticketResponse.ok) return null
    
    const ticketData = await ticketResponse.json()
    
    // 2. Get assigned technician
    let technician = ''
    let technicianId = 0
    
    try {
      const actorsResponse = await fetch(
        `${instance.BASE_URL}/Ticket/${ticketId}/Ticket_User`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Session-Token': sessionToken,
            'App-Token': instance.APP_TOKEN,
          },
        }
      )
      
      if (actorsResponse.ok) {
        const actors = await actorsResponse.json()
        const assignedTech = Array.isArray(actors) ? actors.find((a: any) => a.type === 2) : null
        
        if (assignedTech?.users_id) {
          technicianId = assignedTech.users_id
          
          const userResponse = await fetch(
            `${instance.BASE_URL}/User/${assignedTech.users_id}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Session-Token': sessionToken,
                'App-Token': instance.APP_TOKEN,
              },
            }
          )
          
          if (userResponse.ok) {
            const user = await userResponse.json()
            const firstname = user.firstname || ''
            const realname = user.realname || ''
            const name = user.name || ''
            
            if (firstname && realname) {
              technician = `${firstname} ${realname}`
            } else if (firstname) {
              technician = firstname
            } else if (realname) {
              technician = realname
            } else {
              technician = name
            }
          }
        }
      }
    } catch (e) {
      console.warn(`Erro ao buscar técnico para ticket ${ticketId}:`, e)
    }
    
    // 3. Get entity name (if not already resolved)
    let entityFull = ticketData.completename || ''
    const entity = processEntity(entityFull, instance === GLPI_INSTANCES.PETA ? 'PETA' : 'GMX')
    
    // 4. Get category
    const category = ticketData.itilcategories_id ? ticketData.itilcategories_id.name : ''
    const rootCategory = getRootCategory(category)
    
    // 5. Get status
    const statusId = parseInt(ticketData.status) || 1
    
    // 6. Get dates
    const dateCreated = ticketData.date_creation || null
    const dateMod = ticketData.date_mod || null
    const dueDate = ticketData.time_to_resolve || null
    
    // 7. Get group
    const groupName = ticketData.groups_id ? ticketData.groups_id.name : 'Não atribuído'
    
    return {
      technician,
      technician_id: technicianId,
      entity,
      entity_full: entityFull,
      category,
      root_category: rootCategory,
      status_id: statusId,
      status_key: getStatusKey(statusId),
      status_name: getStatusName(statusId),
      group_name: groupName,
      date_created: dateCreated,
      date_mod: dateMod,
      due_date: dueDate,
      is_sla_late: checkSlaLate(dueDate),
      title: ticketData.name || '',
    }
    
  } catch (error) {
    console.error(`Erro ao buscar detalhes do ticket ${ticketId}:`, error)
    return null
  }
}

async function syncTicketDetails(instanceName: 'PETA' | 'GMX'): Promise<{ updated: number, failed: number, total: number }> {
  const instance = GLPI_INSTANCES[instanceName]
  
  console.log(`Sincronizando detalhes para ${instanceName}...`)
  
  const sessionToken = await initSession(instance)
  
  // Buscar tickets que precisam de atualização (todos sem limite, ou filtrar)
  const { data: tickets, error } = await supabase
    .from('tickets_cache')
    .select('ticket_id, last_sync, technician')
    .eq('instance', instanceName)
    .order('date_mod', { ascending: false })
    .limit(MAX_TICKETS_PER_RUN)
  
  if (error) {
    console.error(`Erro ao buscar tickets:`, error)
    throw error
  }
  
  if (!tickets || tickets.length === 0) {
    console.log(`${instanceName}: Nenhum ticket para atualizar`)
    return { updated: 0, failed: 0, total: 0 }
  }
  
  console.log(`${instanceName}: Atualizando ${tickets.length} tickets...`)
  
  let updated = 0
  let failed = 0
  
  for (const ticket of tickets) {
    const details = await getTicketDetailsFromGLPI(ticket.ticket_id, instance, sessionToken)
    
    if (details) {
      const { error: updateError } = await supabase
        .from('tickets_cache')
        .update({
          technician: details.technician,
          technician_id: details.technician_id,
          entity: details.entity,
          entity_full: details.entity_full,
          category: details.category,
          root_category: details.root_category,
          status_id: details.status_id,
          status_key: details.status_key,
          status_name: details.status_name,
          group_name: details.group_name,
          title: details.title,
          date_created: details.date_created,
          date_mod: details.date_mod,
          due_date: details.due_date,
          is_sla_late: details.is_sla_late,
          last_sync: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('ticket_id', ticket.ticket_id)
        .eq('instance', instanceName)
      
      if (updateError) {
        console.error(`Erro atualizar ticket ${ticket.ticket_id}:`, updateError)
        failed++
      } else {
        updated++
      }
    } else {
      failed++
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  console.log(`${instanceName}: Atualizados ${updated}, falhas ${failed}`)
  return { updated, failed, total: tickets.length }
}

Deno.serve(async (req) => {
  console.log('Iniciando sincronização de detalhes de tickets...')
  
  const startTime = Date.now()
  
  try {
    // Pode especificar qual instância via query param
    const url = new URL(req.url)
    const instance = url.searchParams.get('instance')
    
    let petaResult = { updated: 0, failed: 0, total: 0 }
    let gmxResult = { updated: 0, failed: 0, total: 0 }
    
    if (!instance || instance === 'PETA') {
      petaResult = await syncTicketDetails('PETA')
    }
    
    if (!instance || instance === 'GMX') {
      gmxResult = await syncTicketDetails('GMX')
    }
    
    const duration = Date.now() - startTime
    const totalUpdated = petaResult.updated + gmxResult.updated
    const totalFailed = petaResult.failed + gmxResult.failed
    const total = petaResult.total + gmxResult.total
    
    console.log(`Concluído: ${totalUpdated}/${total} atualizados, ${totalFailed} falhas em ${duration}ms`)
    
    return new Response(
      JSON.stringify({
        success: true,
        results: { 
          peta: petaResult, 
          gmx: gmxResult 
        },
        total_updated: totalUpdated,
        total_failed: totalFailed,
        total: total,
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