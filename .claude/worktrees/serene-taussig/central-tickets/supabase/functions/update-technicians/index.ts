// Supabase Edge Function para atualizar técnicos de tickets existentes
// Execute esta função para preencher o campo technician dos tickets já salvos

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

const BATCH_SIZE = 10 // Tickets por request
const MAX_TICKETS_PER_RUN = 50 // Máximo de tickets para atualizar por execução

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

async function updateTechniciansForInstance(instanceName: 'PETA' | 'GMX'): Promise<{ updated: number, failed: number }> {
  const instance = GLPI_INSTANCES[instanceName]
  
  console.log(`Atualizando técnicos para ${instanceName}...`)
  
  const sessionToken = await initSession(instance)
  
  // Buscar tickets sem técnico ou com técnico vazio
  const { data: tickets, error } = await supabase
    .from('tickets_cache')
    .select('ticket_id, technician')
    .eq('instance', instanceName)
    .or('technician.is.null,technician.eq.')
    .limit(MAX_TICKETS_PER_RUN)
  
  if (error) {
    console.error(`Erro ao buscar tickets:`, error)
    throw error
  }
  
  if (!tickets || tickets.length === 0) {
    console.log(`${instanceName}: Nenhum ticket precisa de atualização`)
    return { updated: 0, failed: 0 }
  }
  
  console.log(`${instanceName}: ${tickets.length} tickets para atualizar`)
  
  let updated = 0
  let failed = 0
  
  for (const ticket of tickets) {
    const tech = await getTechnicianForTicket(ticket.ticket_id, instance, sessionToken)
    
    if (tech) {
      const { error: updateError } = await supabase
        .from('tickets_cache')
        .update({
          technician: tech.name,
          technician_id: tech.id,
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
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  console.log(`${instanceName}: Atualizados ${updated}, falhas ${failed}`)
  return { updated, failed }
}

Deno.serve(async (req) => {
  console.log('Iniciando atualização de técnicos...')
  
  const startTime = Date.now()
  
  try {
    // Pode especificar qual instância via query param
    const url = new URL(req.url)
    const instance = url.searchParams.get('instance')
    
    let petaResult = { updated: 0, failed: 0 }
    let gmxResult = { updated: 0, failed: 0 }
    
    if (!instance || instance === 'PETA') {
      petaResult = await updateTechniciansForInstance('PETA')
    }
    
    if (!instance || instance === 'GMX') {
      gmxResult = await updateTechniciansForInstance('GMX')
    }
    
    const duration = Date.now() - startTime
    const totalUpdated = petaResult.updated + gmxResult.updated
    const totalFailed = petaResult.failed + gmxResult.failed
    
    console.log(`Concluído: ${totalUpdated} atualizados, ${totalFailed} falhas em ${duration}ms`)
    
    return new Response(
      JSON.stringify({
        success: true,
        results: { 
          peta: petaResult, 
          gmx: gmxResult 
        },
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