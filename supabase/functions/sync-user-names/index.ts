import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function syncUserNames(): Promise<void> {
  console.log('[syncUserNames] iniciando busca de nomes de usuarios')

  // Buscar tickets com technician_id ou requester_id para sincronizar nomes
  const { data: ticketsWithIds, error: queryError } = await supabase
    .from('tickets_cache')
    .select('ticket_id, instance, technician_id, requester_id')
    .or('technician_id.not.is.null,requester_id.not.is.null')
    .limit(5000)

  if (queryError) {
    console.error('[syncUserNames] erro ao buscar tickets:', queryError.message)
    return
  }

  if (!ticketsWithIds || ticketsWithIds.length === 0) {
    console.log('[syncUserNames] nenhum ticket encontrado com IDs de usuario')
    return
  }

  console.log(`[syncUserNames] processando ${ticketsWithIds.length} tickets`)

  // Coletar IDs únicos por instância
  const techIdsByInstance: Record<string, number[]> = { PETA: [], GMX: [] }
  const reqIdsByInstance: Record<string, number[]> = { PETA: [], GMX: [] }

  for (const t of ticketsWithIds) {
    const inst = t.instance || 'PETA'
    if (t.technician_id && t.technician_id > 0 && !techIdsByInstance[inst].includes(t.technician_id)) {
      techIdsByInstance[inst].push(t.technician_id)
    }
    if (t.requester_id && t.requester_id > 0 && !reqIdsByInstance[inst].includes(t.requester_id)) {
      reqIdsByInstance[inst].push(t.requester_id)
    }
  }

  // Buscar nomes de técnicos por instância
  const techNames: Record<string, Record<number, string>> = { PETA: {}, GMX: {} }
  for (const inst of ['PETA', 'GMX'] as const) {
    const ids = techIdsByInstance[inst]
    if (ids.length === 0) continue

    const { data: techUsers } = await supabase
      .from('glpi_users')
      .select('id, name')
      .eq('instance', inst)
      .in('id', ids)

    if (techUsers) {
      for (const u of techUsers) {
        techNames[inst][u.id] = u.name || ''
      }
    }
  }

  // Buscar nomes de solicitantes por instância
  const reqNames: Record<string, Record<number, string>> = { PETA: {}, GMX: {} }
  for (const inst of ['PETA', 'GMX'] as const) {
    const ids = reqIdsByInstance[inst]
    if (ids.length === 0) continue

    const { data: reqUsers } = await supabase
      .from('glpi_users')
      .select('id, name')
      .eq('instance', inst)
      .in('id', ids)

    if (reqUsers) {
      for (const u of reqUsers) {
        reqNames[inst][u.id] = u.name || ''
      }
    }
  }

  console.log(`[syncUserNames] PETA técnicos: ${Object.keys(techNames.PETA).length}, PETA solicitantes: ${Object.keys(reqNames.PETA).length}`)
  console.log(`[syncUserNames] GMX técnicos: ${Object.keys(techNames.GMX).length}, GMX solicitantes: ${Object.keys(reqNames.GMX).length}`)

  // Atualizar tickets com nomes encontrados
  let updated = 0
  for (const t of ticketsWithIds) {
    const inst = t.instance || 'PETA'
    const techName = t.technician_id ? techNames[inst][t.technician_id] : null
    const reqName = t.requester_id ? reqNames[inst][t.requester_id] : null

    if (techName || reqName) {
      const updateData: Record<string, unknown> = {
        ticket_id: t.ticket_id,
        instance: inst,
      }
      if (techName) updateData.technician = techName
      if (reqName) updateData.requester = reqName

      const { error } = await supabase
        .from('tickets_cache')
        .upsert(updateData, { onConflict: 'ticket_id,instance' })

      if (!error) updated++
    }
  }

  console.log(`[syncUserNames] concluído, ${updated} tickets atualizados`)
}

Deno.serve(async (req) => {
  try {
    // Suporte para método GET (cron) e POST (manual)
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200 })
    }

    await syncUserNames()
    return new Response(JSON.stringify({ ok: true, message: 'Nomes de usuarios sincronizados com sucesso' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.error('[syncUserNames] erro:', e?.message || e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})