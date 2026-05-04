import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function syncUserNames(): Promise<void> {
  console.log('[syncUserNames] iniciando...')

  // Buscar todos os tickets que têm valores em technician ou requester
  const { data: ticketsToUpdate } = await supabase
    .from('tickets_cache')
    .select('ticket_id, instance, technician, requester')
    .or('technician.not.is.null,requester.not.is.null')
    .limit(10000)

  if (!ticketsToUpdate || ticketsToUpdate.length === 0) {
    console.log('[syncUserNames] Nenhum ticket para atualizar')
    return
  }

  console.log(`[syncUserNames] ${ticketsToUpdate.length} tickets para processar`)

  // Coletar IDs únicos
  const allUserIds = new Set<number>()
  
  for (const t of ticketsToUpdate) {
    const techId = parseInt(String(t.technician || ''), 10)
    const reqId = parseInt(String(t.requester || ''), 10)
    
    if (techId > 0 && techId < 100000) allUserIds.add(techId)
    if (reqId > 0 && reqId < 100000) allUserIds.add(reqId)
  }

  const uniqueIds = [...allUserIds]
  console.log(`[syncUserNames] IDs únicos encontrados: ${uniqueIds.length}`)

  if (uniqueIds.length === 0) {
    console.log('[syncUserNames] Nenhum ticket com ID de usuário para atualizar')
    return
  }

  // Buscar TODOS os usuários necessários (sem limite)
  // Buscar por ID E instância para evitar conflito entre PETA/GMX (IDs low como 2,3,4 existem em ambos)
  const { data: glpiUsers } = await supabase
    .from('glpi_users')
    .select('id, instance, name, firstname, realname')
    .in('id', uniqueIds)

  console.log(`[syncUserNames] Usuários encontrados no banco: ${glpiUsers?.length || 0}`)
  
  // Log sample de users
  console.log('[syncUserNames] Sample glpi_users:')
  for (const u of (glpiUsers || []).slice(0, 6)) {
    console.log(`  User ${u.id} (${u.instance}): name=${u.name}, firstname=${u.firstname}, realname=${u.realname}`)
  }
  
  // Log sample de tickets com IDs
  const { data: sampleTickets } = await supabase
    .from('tickets_cache')
    .select('ticket_id, instance, technician, requester, technician_id, requester_id')
    .or('technician.not.is.null,requester.not.is.null')
    .limit(10)
  
  console.log('[syncUserNames] Sample de tickets:')
  for (const t of sampleTickets || []) {
    const techId = parseInt(String(t.technician || ''), 10)
    const reqId = parseInt(String(t.requester || ''), 10)
    console.log(`  Ticket ${t.ticket_id} (${t.instance}): tech=${t.technician}, tech_id=${t.technician_id}, req=${t.requester}, req_id=${t.requester_id}`)
  }
  
  // Log por instância
  const counts = { PETA: 0, GMX: 0 }
  for (const u of glpiUsers || []) {
    counts[u.instance as keyof typeof counts]++
  }
  console.log(`[syncUserNames] Por instância - PETA: ${counts.PETA}, GMX: ${counts.GMX}`)

  // Criar mapa de nomes por instância e ID
  const userMap: Record<string, Record<number, string>> = { PETA: {}, GMX: {} }
  for (const u of glpiUsers || []) {
    const fullName = [u.firstname, u.realname].filter(Boolean).join(' ') || u.name || ''
    userMap[u.instance || 'PETA'][u.id] = fullName
  }
  
  console.log(`[syncUserNames] Usuários carregados no mapa: ${glpiUsers?.length || 0}`)

  // Atualizar tickets
  let updated = 0
  let errors = 0

  for (const ticket of ticketsToUpdate) {
    const inst = ticket.instance || 'PETA'
    
    const techId = parseInt(String(ticket.technician || ''), 10)
    const reqId = parseInt(String(ticket.requester || ''), 10)
    
    const techName = (techId > 0 && techId < 100000) ? userMap[inst][techId] : null
    const reqName = (reqId > 0 && reqId < 100000) ? userMap[inst][reqId] : null

    // Só atualizar se encontrou nome na tabela
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

      if (error) {
        errors++
        if (errors <= 5) console.log(`[syncUserNames] erro: ${error.message}`)
      } else {
        updated++
      }
    }
  }

  console.log(`[syncUserNames] Concluído! ${updated} tickets atualizados, ${errors} erros`)
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