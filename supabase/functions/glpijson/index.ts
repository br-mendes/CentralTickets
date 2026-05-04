import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const INSTANCES = [
  { name: 'PETA', baseUrl: Deno.env.get('NEXT_PUBLIC_GLPI_PETA') ?? '', userToken: Deno.env.get('PETA_USER_TOKEN') ?? '', appToken: Deno.env.get('PETA_APP_TOKEN') ?? '' },
  { name: 'GMX', baseUrl: Deno.env.get('NEXT_PUBLIC_GLPI_GMX') ?? '', userToken: Deno.env.get('GMX_USER_TOKEN') ?? '', appToken: Deno.env.get('GMX_APP_TOKEN') ?? '' },
]

const ITEMTYPES = [
  { name: 'Ticket', fields: '1,2,3,4,5,7,8,9,10,12,14,15,17,18,19,20,22,55,80,83,151' },
  { name: 'Change', fields: '1,2,3,4,5,7,8,9,10,12,14,15,17,18,19,20,55,80' },
  { name: 'User', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55' },
  { name: 'Entity', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30' },
  { name: 'Group', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25' },
  { name: 'Computer', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50' },
  { name: 'Software', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35' },
  { name: 'License', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30' },
  { name: 'TicketCategory', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22' },
  { name: 'RequestType', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20' },
  { name: 'SLA', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25' },
  { name: 'SLM', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24' },
  { name: 'SolutionType', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20' },
  { name: 'Problem', fields: '1,2,3,4,5,7,8,9,10,12,14,15,17,18,19,20,55,80' },
  { name: 'Project', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25' },
  { name: 'Task', fields: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23' },
]

async function initSession(inst: { name: string, baseUrl: string, userToken: string, appToken: string }): Promise<string> {
  if (!inst.baseUrl) throw new Error(`${inst.name}: URL não configurada`)
  const r = await fetch(`${inst.baseUrl}/initSession`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `user_token ${inst.userToken}`, 'App-Token': inst.appToken },
  })
  if (!r.ok) throw new Error(`${inst.name}: initSession ${r.status}`)
  const d = await r.json()
  return d.session_token
}

function hdrs(token: string, appToken: string) {
  return { 'Content-Type': 'application/json', 'Session-Token': token, 'App-Token': appToken }
}

async function fetchItem(inst: { name: string, baseUrl: string, userToken: string, appToken: string }, itemtype: string, fields: string) {
  const token = await initSession(inst)
  let url = `${inst.baseUrl}/search/${itemtype}?range=0-0&expand_dropways=true&get_hateoas=false`
  const fieldArr = fields.split(',')
  fieldArr.forEach((id, i) => url += `&forcedisplay[${i}]=${id}`)
  
  const r = await fetch(url, { headers: hdrs(token, inst.appToken) })
  if (!r.ok) return { error: `HTTP ${r.status}`, _httpStatus: r.status }
  const data = await r.json()
  return data.data?.[0] || { _note: 'Nenhum registro encontrado' }
}

async function fetchAll(instanceName: string): Promise<Record<string, unknown>> {
  const inst = INSTANCES.find(i => i.name === instanceName)
  if (!inst) throw new Error(`Instância ${instanceName} não encontrada`)
  
  const results: Record<string, unknown> = { _instance: instanceName, _timestamp: new Date().toISOString() }
  
  for (const it of ITEMTYPES) {
    try {
      results[it.name] = await fetchItem(inst, it.name, it.fields)
    } catch (e) {
      results[it.name] = { error: String(e) }
    }
  }
  
  return results
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const instance = url.searchParams.get('instance') || 'PETA'
  
  try {
    const data = await fetchAll(instance)
    return new Response(JSON.stringify(data, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})