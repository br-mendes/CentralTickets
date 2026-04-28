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

const BATCH_SIZE = 10
const MAX_TICKETS_PER_RUN = 100

function getStatusKey(statusId: number): string {
  switch (statusId) {
    case 1: return 'new'
    case 2:
    case 3: return 'processing'
    case 4: return 'pending'
    case 5: return 'solved'
    case 6: return 'closed'
    case 7: return 'pending-approval'
    default: return 'new'
  }
}

function getStatusName(statusId: number): string {
  switch (statusId) {
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

async function initSession(instance: typeof GLPI_INSTANCES.PETA | typeof GLPI_INSTANCES.GMX) {
  const response = await fetch(`${instance.BASE_URL}/initSession`, {
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

async function getTicketFromGLPI(
  ticketId: number,
  instance: typeof GLPI_INSTANCES.PETA | typeof GLPI_INSTANCES.GMX,
  sessionToken: string
): Promise<any> {
  try {
    const response = await fetch(`${instance.BASE_URL}/Ticket/${ticketId}?expand_dropdowns=true`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Session-Token': sessionToken,
        'App-Token': instance.APP_TOKEN,
      },
    })
    
    if (!response.ok) return null
    
    return await response.json()
  } catch (error) {
    console.error(`Erro ao buscar ticket ${ticketId}:`, error)
    return null
  }
}

async function getTechnicianForTicket(
  ticketId: number,
  instance: typeof GLPI_INSTANCES.PETA | typeof GLPI_INSTANCES.GMX,
  sessionToken: string
): Promise<{ name: string, id: number } | null> {
  try {
    const response = await fetch(
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
    
    if (!response.ok) return null
    
    const data = await response.json()
    if (!data || !Array.isArray(data)) return null
    
    const assignedTech = data.find((actor: any) => actor.type === 2)
    if (!assignedTech || !assignedTech.users_id) return null
    
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
    
    if (!userResponse.ok) {
      return { name: assignedTech.users_id.toString(), id: assignedTech.users_id }
    }
    
    const user = await userResponse.json()
    const firstname = user.firstname || ''
    const realname = user.realname || ''
    const name = user.name || ''
    
    let fullName = ''
    if (firstname && realname) {
      fullName = `${firstname} ${realname}`
    } else if (firstname) {
      fullName = firstname
    } else if (realname) {
      fullName = realname
    } else {
      fullName = name
    }
    
    return { 
      name: fullName || assignedTech.users_id.toString(), 
      id: assignedTech.users_id 
    }
    
  } catch (error) {
    console.error(`Erro técnico ticket ${ticketId}:`, error)
    return null
  }
}

async function updateTicketFromGLPI(
  ticketId: number,
  instanceName: 'PETA' | 'GMX'
): Promise<{ success: boolean; updated: boolean; error?: string }> {
  const instance = GLPI_INSTANCES[instanceName]
  
  try {
    const sessionToken = await initSession(instance)
    
    const ticketData = await getTicketFromGLPI(ticketId, instance, sessionToken)
    if (!ticketData) {
      return { success: false, updated: false, error: 'Ticket not found in GLPI' }
    }
    
    const statusId = parseInt(ticketData.status) || 1
    const statusKey = getStatusKey(statusId)
    const statusName = getStatusName(statusId)
    
    const entityFull = ticketData.entities?.completename || ticketData.entity?.name || ''
    const categoryName = ticketData.itilcategories?.name || ticketData.category?.name || ticketData[7] || 'Não categorizado'
    const groupName = ticketData.groups_id_assign?.name || ticketData.group?.name || ''
    
    const technician = await getTechnicianForTicket(ticketId, instance, sessionToken)
    
    const updateData: any = {
      entity: entityFull,
      category: categoryName,
      status_id: statusId,
      status_key: statusKey,
      status_name: statusName,
      group_name: groupName,
      date_mod: ticketData.date_mod || ticketData['date_mod'] || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    if (technician) {
      updateData.technician = technician.name
      updateData.technician_id = technician.id
    }
    
    if (ticketData.time_to_own) {
      updateData.time_to_own = ticketData.time_to_own
    }
    if (ticketData.time_to_resolve) {
      updateData.time_to_resolve = ticketData.time_to_resolve
    }
    if (ticketData.sla_wait) {
      updateData.is_sla_late = true
    }
    
    const { error: updateError } = await supabase
      .from('tickets_cache')
      .update(updateData)
      .eq('ticket_id', ticketId)
      .eq('instance', instanceName)
    
    if (updateError) {
      return { success: false, updated: false, error: updateError.message }
    }
    
    return { success: true, updated: true }
    
  } catch (error) {
    return { success: false, updated: false, error: error.message }
  }
}

async function updateInstance(instanceName: 'PETA' | 'GMX'): Promise<{ processed: number; updated: number; failed: number }> {
  console.log(`Atualizando tickets de ${instanceName}...`)
  
  const { data: tickets, error } = await supabase
    .from('tickets_cache')
    .select('ticket_id')
    .eq('instance', instanceName)
    .not('status_key', 'in', '("closed","solved")')
    .limit(MAX_TICKETS_PER_RUN)
  
  if (error) {
    console.error(`Erro ao buscar tickets:`, error)
    throw error
  }
  
  if (!tickets || tickets.length === 0) {
    console.log(`${instanceName}: Nenhum ticket precisa de atualização`)
    return { processed: 0, updated: 0, failed: 0 }
  }
  
  console.log(`${instanceName}: ${tickets.length} tickets para atualizar`)
  
  let processed = 0
  let updated = 0
  let failed = 0
  
  for (const ticket of tickets) {
    const result = await updateTicketFromGLPI(ticket.ticket_id, instanceName)
    processed++
    
    if (result.updated) {
      updated++
    } else if (!result.success) {
      failed++
    }
    
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  console.log(`${instanceName}: Processados ${processed}, atualizados ${updated}, falhas ${failed}`)
  return { processed, updated, failed }
}

Deno.serve(async (req) => {
  console.log('Iniciando atualização de tickets do GLPI...')
  
  const startTime = Date.now()
  
  try {
    const url = new URL(req.url)
    const instance = url.searchParams.get('instance')
    
    let petaResult = { processed: 0, updated: 0, failed: 0 }
    let gmxResult = { processed: 0, updated: 0, failed: 0 }
    
    if (!instance || instance === 'PETA') {
      petaResult = await updateInstance('PETA')
    }
    
    if (!instance || instance === 'GMX') {
      gmxResult = await updateInstance('GMX')
    }
    
    const duration = Date.now() - startTime
    const totalProcessed = petaResult.processed + gmxResult.processed
    const totalUpdated = petaResult.updated + gmxResult.updated
    const totalFailed = petaResult.failed + gmxResult.failed
    
    console.log(`Concluído: ${totalProcessed} processados, ${totalUpdated} atualizados, ${totalFailed} falhas em ${duration}ms`)
    
    return new Response(
      JSON.stringify({
        success: true,
        results: { 
          peta: petaResult, 
          gmx: gmxResult 
        },
        total_processed: totalProcessed,
        total_updated: totalUpdated,
        total_failed: totalFailed,
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