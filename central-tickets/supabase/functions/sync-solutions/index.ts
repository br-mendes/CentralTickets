// Supabase Edge Function para sincronizar soluções de tickets do GLPI
// Executar via: supabase functions call sync-solutions

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

interface SyncResult {
  success: boolean
  updated: number
  errors: string[]
}

async function initSession(instance: typeof GLPI_INSTANCES.PETA | typeof GLPI_INSTANCES.GMX) {
  const url = `${instance.BASE_URL}/initSession`
  console.log(`[${instance.BASE_URL}] Iniciando sessão...`)
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `user_token ${instance.USER_TOKEN}`,
      'App-Token': instance.APP_TOKEN,
    },
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Erro initSession: ${response.status} - ${errorText}`)
  }
  
  const data = await response.json()
  return data.session_token
}

async function getSolution(instanceConfig: typeof GLPI_INSTANCES.PETA, sessionToken: string, ticketId: number) {
  try {
    const response = await fetch(
      `${instanceConfig.BASE_URL}/Ticket/${ticketId}/Solution`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Session-Token': sessionToken,
          'App-Token': instanceConfig.APP_TOKEN,
        },
      }
    )
    
    if (!response.ok) {
      return null
    }
    
    const data = await response.json()
    
    // GLPI returns solution object or null
    if (data && data.content) {
      return {
        content: data.content,
        date_creation: data.date_creation || null,
        users_id: data.users_id || null,
      }
    }
    
    return null
  } catch (error) {
    console.error(`Erro ao buscar solução do ticket ${ticketId}:`, error.message)
    return null
  }
}

async function syncInstanceSolutions(instanceName: string, instanceConfig: typeof GLPI_INSTANCES.PETA, limit: number = 100): Promise<SyncResult> {
  console.log(`[${instanceName}] Sincronizando soluções...`)
  
  let sessionToken: string
  try {
    sessionToken = await initSession(instanceConfig)
  } catch (error) {
    return { success: false, updated: 0, errors: [error.message] }
  }
  
  // Get tickets that are solved/closed but don't have solution content
  // Status 5 = solved, 6 = closed
  const { data: tickets, error: fetchError } = await supabase
    .from('tickets_cache')
    .select('id, ticket_id, instance, status_id, solution_content')
    .eq('instance', instanceName.toUpperCase())
    .in('status_id', [5, 6]) // solved or closed
    .or('solution_content.is.null,solution_content.eq.')
    .limit(limit)
  
  if (fetchError) {
    console.error(`Erro ao buscar tickets:`, fetchError)
    return { success: false, updated: 0, errors: [fetchError.message] }
  }
  
  if (!tickets || tickets.length === 0) {
    console.log(`[${instanceName}] Nenhum ticket sem solução encontrado`)
    return { success: true, updated: 0, errors: [] }
  }
  
  console.log(`[${instanceName}] Encontrados ${tickets.length} tickets sem solução`)
  
  let updated = 0
  const errors: string[] = []
  
  for (const ticket of tickets) {
    try {
      const solution = await getSolution(instanceConfig, sessionToken, ticket.ticket_id)
      
      if (solution) {
        // Format the solution with user and date
        const solutionText = solution.content || ''
        
        await supabase
          .from('tickets_cache')
          .update({ 
            solution_content: solutionText,
            date_solved: solution.date_creation || new Date().toISOString()
          })
          .eq('id', ticket.id)
          .eq('instance', ticket.instance)
        
        updated++
        
        if (updated % 20 === 0) {
          console.log(`[${instanceName}] Atualizados ${updated}/${tickets.length}`)
        }
      }
    } catch (error) {
      errors.push(`Ticket ${ticket.ticket_id}: ${error.message}`)
    }
  }
  
  console.log(`[${instanceName}] Concluído: ${updated} soluções atualizadas`)
  
  return { success: true, updated, errors }
}

Deno.serve(async (req) => {
  console.log('=== Sync Solutions iniciar ===')
  
  const startTime = Date.now()
  
  // Parse request body
  const { instance, limit } = await req.json().catch(() => ({}))
  
  // Limite padrão de tickets por execução
  const ticketLimit = limit || 100
  
  try {
    const results: Record<string, SyncResult> = {}
    
    // Process PETA if not specified or specified
    if (!instance || instance === 'PETA') {
      console.log('Processando PETA...')
      results.PETA = await syncInstanceSolutions('PETA', GLPI_INSTANCES.PETA, ticketLimit)
    }
    
    // Process GMX if not specified or specified  
    if (!instance || instance === 'GMX') {
      console.log('Processando GMX...')
      results.GMX = await syncInstanceSolutions('GMX', GLPI_INSTANCES.GMX, ticketLimit)
    }
    
    const totalUpdated = (results.PETA?.updated || 0) + (results.GMX?.updated || 0)
    const elapsed = Date.now() - startTime
    
    console.log(`=== Sync Solutions concluído: ${totalUpdated} atualizações em ${elapsed}ms ===`)
    
    return new Response(JSON.stringify({
      success: true,
      total_updated: totalUpdated,
      results,
      elapsed_ms: elapsed
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('Erro fatal:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
