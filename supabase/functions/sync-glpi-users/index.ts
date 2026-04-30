import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const INSTANCES = [
  { name: 'PETA', baseUrl: Deno.env.get('NEXT_PUBLIC_GLPI_PETA') ?? '', userToken: Deno.env.get('PETA_USER_TOKEN') ?? '', appToken: Deno.env.get('PETA_APP_TOKEN') ?? '' },
  { name: 'GMX', baseUrl: Deno.env.get('NEXT_PUBLIC_GLPI_GMX') ?? '', userToken: Deno.env.get('GMX_USER_TOKEN') ?? '', appToken: Deno.env.get('GMX_APP_TOKEN') ?? '' },
]

async function initSession(inst: { name: string, baseUrl: string, userToken: string, appToken: string }): Promise<string> {
  if (!inst.baseUrl) throw new Error(`${inst.name}: GLPI URL não configurado`)
  const r = await fetch(`${inst.baseUrl}/initSession`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `user_token ${inst.userToken}`, 'App-Token': inst.appToken },
  })
  if (!r.ok) throw new Error(`${inst.name}: initSession ${r.status}`)
  const d = await r.json()
  if (!d.session_token) throw new Error(`${inst.name}: sem session_token`)
  return d.session_token
}

function hdrs(token: string, inst: { appToken: string }) {
  return { 'Content-Type': 'application/json', 'Session-Token': token, 'App-Token': inst.appToken }
}

interface GLPIUser {
  id: number
  name: string
  firstname: string | null
  realname: string | null
  emails: string[]
}

async function fetchAllUsers(inst: { name: string, baseUrl: string, userToken: string, appToken: string }, token: string): Promise<GLPIUser[]> {
  const allUsers: GLPIUser[] = []
  let page = 0
  const pageSize = 50

  while (true) {
    const url = `${inst.baseUrl}/search/User?range=${page * pageSize}-${page * pageSize + pageSize - 1}&expand_dropdowns=true&get_hateoas=false`
    const r = await fetch(url, { headers: hdrs(token, inst) })
    
    if (r.status === 401) {
      token = await initSession(inst)
      continue
    }
    
    if (!r.ok) throw new Error(`${inst.name}: fetch users ${r.status}`)
    
    const data = await r.json()
    const users = data.data || []
    
    if (users.length === 0) break
    
    for (const u of users) {
      const emails: string[] = []
      if (u.name) emails.push(u.name)
      if (u.email) emails.push(u.email)
      
      allUsers.push({
        id: parseInt(u.id) || 0,
        name: u.name || '',
        firstname: u.firstname || null,
        realname: u.realname || null,
        emails,
      })
    }
    
    if (users.length < pageSize) break
    page++
  }
  
  return allUsers
}

async function syncInstance(inst: { name: string, baseUrl: string, userToken: string, appToken: string }): Promise<number> {
  console.log(`[sync-users-${inst.name}] iniciando...`)
  
  const token = await initSession(inst)
  const users = await fetchAllUsers(inst, token)
  
  console.log(`[sync-users-${inst.name}] ${users.length} usuários encontrados`)
  
  if (users.length === 0) return 0
  
  const uniqueMap = new Map<number, typeof users[0]>()
  for (const u of users) {
    if (u.id > 0) uniqueMap.set(u.id, u)
  }
  const uniqueUsers = Array.from(uniqueMap.values())
  console.log(`[sync-users-${inst.name}] ${uniqueUsers.length} usuários únicos (deduped)`)
  
  const toInsert = uniqueUsers.map(u => {
    const fullName = [u.firstname, u.realname].filter(Boolean).join(' ') || u.name || ''
    return {
      id: u.id,
      instance: inst.name,
      name: u.name,
      firstname: u.firstname,
      realname: u.realname,
      fullname: fullName,
      email: u.emails[0] || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }
  })
  
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100)
    const { error } = await supabase.from('glpi_users').upsert(batch, { onConflict: 'id,instance' })
    if (error) throw new Error(`[sync-users-${inst.name}] upsert batch ${i}: ${error.message}`)
  }
  
  console.log(`[sync-users-${inst.name}] ${users.length} usuários sincronizados`)
  return users.length
}

Deno.serve(async (req) => {
  const start = Date.now()
  const results: Record<string, unknown> = {}
  
  try {
    for (const inst of INSTANCES) {
      if (!inst.baseUrl) {
        console.log(`[sync-users] ${inst.name}: URL não configurada, pulando`)
        continue
      }
      try {
        const count = await syncInstance(inst)
        results[inst.name] = { success: true, count }
      } catch (e) {
        console.error(`[sync-users-${inst.name}] erro:`, e?.message || e)
        results[inst.name] = { success: false, error: String(e) }
      }
    }
    
    return new Response(JSON.stringify({ 
      ok: true, 
      results, 
      duration_ms: Date.now() - start 
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('[sync-users] ERRO:', e?.message || e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})