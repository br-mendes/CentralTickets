// Edge Function for GLPI → Supabase Sync
// Deploy: supabase functions deploy glpi-sync

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

const PAGE_SIZE = 50

interface SyncResult {
  success: boolean
  instance: string
  count: number
  error?: string
  completed?: boolean
}

async function initSession(config: { url: string, userToken: string, appToken: string }): Promise<string> {
  const response = await fetch(`${config.url}/initSession`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `user_token ${config.userToken}`,
      'App-Token': config.appToken,
    },
  })
  
  if (!response.ok) {
    throw new Error(`initSession failed: ${response.status}`)
  }
  
  const data = await response.json()
  return data.session_token
}

async function killSession(url: string, sessionToken: string, appToken: string) {
  try {
    await fetch(`${url}/killSession`, {
      method: 'GET',
      headers: {
        'Session-Token': sessionToken,
        'App-Token': appToken,
      },
    })
  } catch (e) {
    // Ignore errors on cleanup
  }
}

function processTicket(ticket: any[], instance: string) {
  const statusId = parseInt(ticket[12]) || 1
  const entityFull = ticket[80] || ''
  
  let entity = entityFull
  if (instance === 'PETA' && entityFull.startsWith('PETA')) {
    entity = entityFull.replace(/^PETA\s*GRUPO\s*>\s*/gi, '').trim()
  } else if (instance === 'GMX' && entityFull.startsWith('GMX')) {
    entity = entityFull.replace(/^GMX\s*TECNOLOGIA\s*>\s*/gi, '').trim()
  }
  
  const statusMap: Record<number, { key: string, name: string }> = {
    1: { key: 'new', name: 'Novo' },
    2: { key: 'processing', name: 'Em atendimento' },
    3: { key: 'processing', name: 'Em atendimento' },
    4: { key: 'pending', name: 'Pendente' },
    5: { key: 'solved', name: 'Solucionado' },
    6: { key: 'closed', name: 'Fechado' },
    7: { key: 'pending-approval', name: 'Aprovação' },
  }
  
  const status = statusMap[statusId] || { key: 'new', name: 'Novo' }
  const dueDate = ticket[151]
  const isSlaLate = dueDate ? new Date(dueDate) < new Date() : false

  return {
    ticket_id: parseInt(ticket[2]) || 0,
    instance: instance,
    title: ticket[1] || 'Sem título',
    entity: entity,
    entity_full: entityFull,
    category: ticket[7] || 'Não categorizado',
    status_id: statusId,
    status_key: status.key,
    status_name: status.name,
    group_name: ticket[8] || '',
    date_created: ticket[15] || ticket.date_creation || null,
    date_mod: ticket[19] || ticket.date_mod || null,
    due_date: dueDate || null,
    is_sla_late: isSlaLate,
    last_sync: new Date().toISOString(),
  }
}

async function syncInstance(instanceName: 'PETA' | 'GMX'): Promise<SyncResult> {
  const config = GLPI_CONFIG[instanceName]
  
  console.log(`🔄 Syncing ${instanceName}...`)
  
  if (!config.userToken || !config.appToken) {
    return { success: false, instance: instanceName, count: 0, error: 'Missing credentials' }
  }
  
  let sessionToken: string | null = null
  
  try {
    // First, check total count from page 0
    const searchUrl = `${config.url}/search/Ticket?range=0-${PAGE_SIZE-1}&expand_dropdowns=true&get_hateoas=false`
    
    // No session needed for initial count check (optional, but we'll do it after init)
    sessionToken = await initSession(config)
    console.log(`${instanceName}: Session initialized`)
    
    const countResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Session-Token': sessionToken,
        'App-Token': config.appToken,
      },
    })
    
    if (!countResponse.ok) {
      const errorText = await countResponse.text()
      throw new Error(`GLPI count failed: ${countResponse.status} - ${errorText.substring(0, 100)}`)
    }
    
    const countData = await countResponse.json()
    const totalCount = countData.totalcount || 0
    const totalPages = Math.ceil(totalCount / PAGE_SIZE)
    
    console.log(`${instanceName}: ${totalCount} tickets, ${totalPages} pages total`)
    
    // Get current progress to determine next page
    const { data: syncState } = await supabase
      .from('sync_control')
      .select('last_page')
      .eq('instance', instanceName)
      .single()
    
    let startPage = 0
    if (syncState?.last_page !== null && syncState.last_page !== undefined) {
      if (syncState.last_page < totalPages - 1) {
        startPage = syncState.last_page + 1
      } else {
        // Already at end - reset to 0 for full sync
        console.log(`${instanceName}: Previous sync completed, resetting for full sync`)
        startPage = 0
      }
    }
    
    console.log(`${instanceName}: Starting from page ${startPage}`)
    
    // Fetch the data page
    const start = startPage * PAGE_SIZE
    const end = start + PAGE_SIZE - 1
    
    const pageUrl = `${config.url}/search/Ticket?range=${start}-${end}&expand_dropdowns=true&get_hateoas=false`
    
    const pageResponse = await fetch(pageUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Session-Token': sessionToken,
        'App-Token': config.appToken,
      },
    })
    
    if (!pageResponse.ok) {
      const errorText = await pageResponse.text()
      throw new Error(`GLPI page failed: ${pageResponse.status} - ${errorText.substring(0, 100)}`)
    }
    
    const pageData = await pageResponse.json()
    
    if (!pageData.data || pageData.data.length === 0) {
      await supabase.from('sync_control').upsert({
        instance: instanceName,
        last_sync: new Date().toISOString(),
        status: 'success',
        last_page: totalPages - 1,
        total_pages: totalPages,
        tickets_count: totalCount,
        updated_at: new Date().toISOString()
      }, { onConflict: 'instance' })
      
      return { success: true, instance: instanceName, count: 0, completed: true }
    }
    
    const tickets = pageData.data.map((t: any) => processTicket(t, instanceName))
    console.log(`${instanceName}: Processing ${tickets.length} tickets`)
    
    const { error: upsertError } = await supabase
      .from('tickets_cache')
      .upsert(tickets, { onConflict: 'ticket_id,instance' })
    
    if (upsertError) {
      console.error(`${instanceName}: Upsert error:`, upsertError)
      throw upsertError
    }
    
    const completed = startPage >= totalPages - 1
    await supabase.from('sync_control').upsert({
      instance: instanceName,
      last_sync: new Date().toISOString(),
      status: completed ? 'success' : 'in_progress',
      last_page: startPage,
      total_pages: totalPages,
      tickets_count: totalCount,
      updated_at: new Date().toISOString()
    }, { onConflict: 'instance' })
    
    console.log(`✅ ${instanceName}: Synced ${tickets.length} tickets (page ${startPage}/${totalPages})`)
    
    return { 
      success: true, 
      instance: instanceName, 
      count: tickets.length,
      completed 
    }
    
  } catch (error) {
    console.error(`❌ ${instanceName}: Error:`, error.message)
    
    return { 
      success: false, 
      instance: instanceName, 
      count: 0, 
      error: error.message 
    }
    
  } finally {
    if (sessionToken) {
      await killSession(config.url, sessionToken, config.appToken)
    }
  }
}

// Create Supabase client
const supabaseUrl = SUPABASE_URL
const supabaseKey = SUPABASE_SERVICE_ROLE_KEY
const { createClient } = await import('npm:@supabase/supabase-js@2')
const supabase = createClient(supabaseUrl, supabaseKey)

// Main handler
Deno.serve(async (req) => {
  console.log('🚀 GLPI Sync Job Started')
  const startTime = Date.now()
  
  try {
    // Run both instances
    const petaResult = await syncInstance('PETA')
    const gmxResult = await syncInstance('GMX')
    
    const duration = Date.now() - startTime
    const totalCount = petaResult.count + gmxResult.count
    
    console.log(`📊 Results: PETA=${petaResult.count}, GMX=${gmxResult.count}, Total=${totalCount}, Duration=${duration}ms`)
    
    // Log to sync_logs
    await supabase.from('sync_logs').insert({
      instance: 'ALL',
      finished_at: new Date().toISOString(),
      status: (petaResult.success && gmxResult.success) ? 'success' : 'failed',
      tickets_processed: totalCount,
      error_message: !petaResult.success ? petaResult.error : (!gmxResult.success ? gmxResult.error : null)
    })
    
    return new Response(JSON.stringify({
      success: petaResult.success && gmxResult.success,
      peta: petaResult,
      gmx: gmxResult,
      total_synced: totalCount,
      duration_ms: duration
    }), { headers: { 'Content-Type': 'application/json' } })
    
  } catch (error) {
    console.error('💥 Fatal error:', error.message)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})