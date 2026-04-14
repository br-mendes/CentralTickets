// Simplified Edge Function for GLPI Sync
// Use 'npm:' prefix for imports

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  console.log('🔄 Starting GLPI sync job...')
  
  const startTime = Date.now()
  const TIMEOUT_MS = 55000 // Leave 10s buffer for cleanup
  
  try {
    // Get sync state
    const { data: syncState } = await supabase
      .from('sync_control')
      .select('*')
      .order('last_sync', { ascending: false })
      .limit(2)
    
    console.log('Current sync state:', syncState)
    
    // Get last log
    const { data: lastLog } = await supabase
      .from('sync_logs')
      .select('*')
      .order('finished_at', { ascending: false })
      .limit(1)
      .single()
    
    console.log('Last sync log:', lastLog)
    
    // Log completion
    const duration = Date.now() - startTime
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Sync check completed',
      syncState: syncState,
      lastSync: lastLog,
      duration_ms: duration
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})