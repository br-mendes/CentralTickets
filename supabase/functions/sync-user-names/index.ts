import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function syncUserNames(): Promise<void> {
  console.log('[syncUserNames] iniciando...')

  // O sync do GLPI está populando 'requester' e 'technician' com IDs numéricos
  // Precisamos usar esses valores para buscar nomes na glpi_users
  
  // Buscar tickets que têm valores em technician ou requester (que são IDs)
  const { data: ticketsToUpdate } = await supabase
    .from('tickets_cache')
    .select('ticket_id, instance, technician, requester')
    .or('technician.not.is.null,requester.not.is.null')
    .limit(2000)

  if (!ticketsToUpdate || ticketsToUpdate.length === 0) {
    console.log('[syncUserNames] Nenhum ticket para atualizar')
    return
  }

  console.log(`[syncUserNames] ${ticketsToUpdate.length} tickets para processar`)

  // Coletar IDs únicos
  const allUserIds = new Set<number>()
  
  for (const t of ticketsToUpdate) {
    // technician pode ser ID numérico ou nome
    const techId = parseInt(String(t.technician || ''), 10)
    if (techId > 0) allUserIds.add(techId)
    
    // requester pode ser ID numérico ou nome
    const reqId = parseInt(String(t.requester || ''), 10)
    if (reqId > 0) allUserIds.add(reqId)
  }

  const uniqueIds = [...allUserIds]
  console.log(`[syncUserNames] IDs únicos encontrados: ${uniqueIds.length}`)

  if (uniqueIds.length === 0) {
    console.log('[syncUserNames] Nenhum ID de usuário válido encontrado')
    return
  }

  // Buscar nomes na glpi_users
  const { data: glpiUsers } = await supabase
    .from('glpi_users')
    .select('id, instance, name, firstname, realname')
    .in('id', uniqueIds)

  // Criar mapa de nomes por instância e ID
  const userMap: Record<string, Record<number, string>> = { PETA: {}, GMX: {} }
  for (const u of glpiUsers || []) {
    const fullName = [u.firstname, u.realname].filter(Boolean).join(' ') || u.name || ''
    userMap[u.instance || 'PETA'][u.id] = fullName
  }

  console.log(`[syncUserNames] Usuários carregados no mapa: ${glpiUsers?.length || 0}`)

  // Atualizar tickets
  let updated = 0
  for (const ticket of ticketsToUpdate) {
    const inst = ticket.instance || 'PETA'
    
    const techId = parseInt(String(ticket.technician || ''), 10)
    const reqId = parseInt(String(ticket.requester || ''), 10)
    
    const techName = techId > 0 ? userMap[inst][techId] : null
    const reqName = reqId > 0 ? userMap[inst][reqId] : null

    if (techName || reqName) {
      const updates: Record<string, unknown> = {
        ticket_id: ticket.ticket_id,
        instance: inst,
      }
      if (techName && techId > 0) updates.technician = techName
      if (reqName && reqId > 0) updates.requester = reqName

      const { error } = await supabase
        .from('tickets_cache')
        .upsert(updates, { onConflict: 'ticket_id,instance' })

      if (!error) updated++
    }
  }

  console.log(`[syncUserNames] Concluído! ${updated} tickets atualizados`)
}

Deno.serve(async (req) => {
  try {
    await syncUserNames()
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('[syncUserNames] ERRO:', e?.message || e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})