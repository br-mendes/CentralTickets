import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function syncUserNames(): Promise<void> {
  console.log('[syncUserNames] iniciando...')

  // Primeiro, verificar quais campos existem e têm valores
  const { data: sampleTickets, error: sampleError } = await supabase
    .from('tickets_cache')
    .select('ticket_id, instance, technician, technician_id, requester, requester_id')
    .limit(10)

  if (sampleError) {
    console.error('[syncUserNames] erro ao buscar sample:', sampleError.message)
    return
  }

  console.log('[syncUserNames] Sample de tickets:')
  for (const t of sampleTickets || []) {
    console.log(`  Ticket ${t.ticket_id} (${t.instance}): tech=${t.technician}, tech_id=${t.technician_id}, req=${t.requester}, req_id=${t.requester_id}`)
  }

  // Verificar se glpi_users tem dados
  const { data: glpiUsers } = await supabase
    .from('glpi_users')
    .select('id, instance, name, firstname, realname')
    .limit(5)
  
  console.log('[syncUserNames] Sample glpi_users:')
  for (const u of glpiUsers || []) {
    console.log(`  User ${u.id} (${u.instance}): name=${u.name}, firstname=${u.firstname}, realname=${u.realname}`)
  }

  // Buscar tickets que precisam de atualização (onde technician ou requester estão vazios mas têm ID)
  const { data: ticketsNeedingUpdate } = await supabase
    .from('tickets_cache')
    .select('ticket_id, instance, technician_id, requester_id')
    .gt('technician_id', 0)
    .or('requester_id.gt.0')
    .limit(2000)

  if (!ticketsNeedingUpdate || ticketsNeedingUpdate.length === 0) {
    console.log('[syncUserNames] Nenhum ticket com ID de usuário para atualizar')
    return
  }

  console.log(`[syncUserNames] ${ticketsNeedingUpdate.length} tickets para processar`)

  // Coletar IDs únicos
  const allTechIds = [...new Set(ticketsNeedingUpdate.map(t => t.technician_id).filter(id => id > 0))]
  const allReqIds = [...new Set(ticketsNeedingUpdate.map(t => t.requester_id).filter(id => id > 0))]
  
  console.log(`[syncUserNames] IDs únicos - técnicos: ${allTechIds.length}, solicitantes: ${allReqIds.length}`)

  // Buscar todos os usuários necessários de uma vez
  const allUserIds = [...new Set([...allTechIds, ...allReqIds])]
  
  const { data: allUsers } = await supabase
    .from('glpi_users')
    .select('id, instance, name, firstname, realname')
    .in('id', allUserIds)

  // Criar mapa de nomes por instância e ID
  const userMap: Record<string, Record<number, string>> = { PETA: {}, GMX: {} }
  for (const u of allUsers || []) {
    const fullName = [u.firstname, u.realname].filter(Boolean).join(' ') || u.name || ''
    userMap[u.instance || 'PETA'][u.id] = fullName
  }

  console.log(`[syncUserNames] Usuários carregados no mapa`)

  // Atualizar tickets em lotes
  let updated = 0
  for (const ticket of ticketsNeedingUpdate) {
    const inst = ticket.instance || 'PETA'
    const techName = ticket.technician_id > 0 ? userMap[inst][ticket.technician_id] : null
    const reqName = ticket.requester_id > 0 ? userMap[inst][ticket.requester_id] : null

    if (techName || reqName) {
      const updates: Record<string, unknown> = {
        ticket_id: ticket.ticket_id,
        instance: inst,
      }
      if (techName) updates.technician = techName
      if (reqName) updates.requester = reqName

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