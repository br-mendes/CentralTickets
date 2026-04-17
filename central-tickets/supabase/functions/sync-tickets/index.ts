// Supabase Edge Function para sincronização de tickets
// Suporta sincronização incremental via múltiplas invocações
// Agendar via: Supabase Dashboard > Edge Functions > Schedules

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

const PAGE_SIZE = 25 // Tickets por página (padrão GLPI)
const MAX_PAGES_PER_RUN = 10 // Máximo de páginas por execução (~250 tickets)

interface TicketData {
  id: number
  ticket_id: number
  title: string
  entity: string
  entity_full: string
  category: string
  root_category: string
  status_id: number
  status_key: string
  status_name: string
  group_name: string
  technician: string
  technician_id: number
  date_created: string | null
  date_mod: string | null
  due_date: string | null
  is_sla_late: boolean
  type_id: number
  priority_id: number
  instance: string
}

interface SyncResult {
  success: boolean
  count?: number
  error?: string
  completed?: boolean
  pagesProcessed?: number
  lastPage?: number
  totalPages?: number
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
    console.error(`[${instance.BASE_URL}] Erro initSession: ${response.status}`, errorText)
    throw new Error(`Erro ao iniciar sessão: ${response.status}`)
  }
  
  const data = await response.json()
  return data.session_token
}

async function getPageRange(instance: typeof GLPI_INSTANCES.PETA | typeof GLPI_INSTANCES.GMX, sessionToken: string, startPage: number, maxPages: number) {
  const tickets: any[] = []
  let page = startPage
  const endPage = startPage + maxPages
  
  // Primeiro, pega o totalcount da primeira página
  const firstStart = page * PAGE_SIZE
  const firstEnd = firstStart + PAGE_SIZE - 1
  
  const firstSearchParams = new URLSearchParams({
    'range': `${firstStart}-${firstEnd}`,
    'expand_dropdowns': 'true',
    'get_hateoas': 'false',
  })
  
  const firstUrl = `${instance.BASE_URL}/search/Ticket?${firstSearchParams.toString()}`
  console.log(`[${instance.BASE_URL}] Primeiro request: range ${firstStart}-${firstEnd}, pageSize=${PAGE_SIZE}`)
  
  let firstResponse = await fetch(firstUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Session-Token': sessionToken,
      'App-Token': instance.APP_TOKEN,
    },
  })
  
  // Se 401, renova sessão e tenta novamente
  if (firstResponse.status === 401) {
    console.log(`[${instance.BASE_URL}] Sessão expirada, renovando...`)
    sessionToken = await initSession(instance)
    firstResponse = await fetch(firstUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Session-Token': sessionToken,
        'App-Token': instance.APP_TOKEN,
      },
    })
  }
  
  if (!firstResponse.ok) {
    const errorText = await firstResponse.text()
    console.error(`[${instance.BASE_URL}] Erro primeira página (${firstResponse.status}):`, errorText)
    throw new Error(`Erro ao buscar primeira página: ${firstResponse.status} - ${errorText.substring(0, 100)}`)
  }
  
  const firstData = await firstResponse.json()
  const totalCount = firstData.totalcount || 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  
  console.log(`[${instance.BASE_URL}] Total: ${totalCount} tickets, ${totalPages} páginas`)
  
  if (!firstData.data || firstData.data.length === 0) {
    return { tickets: [], completed: true, lastPage: page, totalPages }
  }
  
  tickets.push(...firstData.data)
  page++
  
  // Processa as páginas restantes
  while (page < endPage && page < totalPages) {
    const start = page * PAGE_SIZE
    const end = start + PAGE_SIZE - 1
    
    const searchParams = new URLSearchParams({
      'range': `${start}-${end}`,
      'expand_dropdowns': 'true',
      'get_hateoas': 'false',
    })
    
    const url = `${instance.BASE_URL}/search/Ticket?${searchParams.toString()}`
    console.log(`[${instance.BASE_URL}] Buscando página ${page} (range: ${start}-${end})`)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Session-Token': sessionToken,
        'App-Token': instance.APP_TOKEN,
      },
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[${instance.BASE_URL}] Erro página ${page}: ${response.status}`, errorText)
      if (response.status === 401) {
        sessionToken = await initSession(instance)
        continue
      }
      throw new Error(`Erro na busca: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (!data.data || data.data.length === 0) break
    
    tickets.push(...data.data)
    page++
    
    // Verifica se chegou ao final
    if (data.data.length < PAGE_SIZE || page >= totalPages) {
      break
    }
  }
  
  const completed = page >= totalPages
  return { tickets, completed, lastPage: page, totalPages }
}

function processEntity(entityFull: string, instanceName: string): string {
  if (!entityFull) return entityFull
  if (instanceName === 'PETA') {
    return entityFull.replace(/^PETA\s*GRUPO\s*>\s*/gi, '').trim()
  } else if (instanceName === 'GMX') {
    return entityFull.replace(/^GMX\s*TECNOLOGIA\s*>\s*/gi, '').trim()
  }
  return entityFull
}

function getRootCategory(category: string): string {
  if (!category) return 'Não categorizado'
  const parts = category.split(' > ')
  return parts[0].trim()
}

function getStatusKey(statusId: number): string {
  switch (statusId) {
    case 1: return 'new'
    case 2:
    case 3: return 'processing'
    case 4: return 'pending'
    case 5: return 'solved'
    case 6: return 'closed'
    case 7: return 'pending-approval'
    default: return 'new'
  }
}

function getStatusName(statusId: number): string {
  switch (statusId) {
    case 1: return 'Novo'
    case 2:
    case 3: return 'Em atendimento'
    case 4: return 'Pendente'
    case 5: return 'Solucionado'
    case 6: return 'Fechado'
    case 7: return 'Aprovação'
    default: return 'Novo'
  }
}

function checkSlaLate(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

function processTickets(tickets: any[], instanceName: string): TicketData[] {
  return tickets.map(ticket => {
    const statusId = parseInt(ticket[12]) || 1
    const entityFull = ticket[80] || ''
    const dateCreated = ticket.date_creation || ticket[15] || ticket.date
    const dateMod = ticket.date_mod || ticket[19] || ticket[91] || dateCreated
    const dueDate = ticket[151]

    const typeId = parseInt(ticket[14]) || 2  // 1=Incident, 2=Request
    const priorityId = parseInt(ticket[3]) || 1

    return {
      id: 0,
      ticket_id: parseInt(ticket[2]) || ticket.id,
      title: ticket[1] || 'Sem título',
      entity: processEntity(entityFull, instanceName),
      entity_full: entityFull,
      category: ticket[7] || 'Não categorizado',
      root_category: getRootCategory(ticket[7]),
      status_id: statusId,
      status_key: getStatusKey(statusId),
      status_name: getStatusName(statusId),
      group_name: ticket[8] || 'Não atribuído',
      technician: '',
      technician_id: 0,
      date_created: dateCreated,
      date_mod: dateMod,
      due_date: dueDate,
      is_sla_late: checkSlaLate(dueDate),
      type_id: typeId,
      priority_id: priorityId,
      instance: instanceName
    }
  })
}

async function fetchTechniciansForTickets(
  tickets: TicketData[], 
  instance: typeof GLPI_INSTANCES.PETA | typeof GLPI_INSTANCES.GMX,
  sessionToken: string
): Promise<Map<number, { name: string, id: number }>> {
  const techMap = new Map<number, { name: string, id: number }>()
  
  // Fetch technicians in batches to avoid too many requests
  const batchSize = 10
  
  for (let i = 0; i < tickets.length; i += batchSize) {
    const batch = tickets.slice(i, i + batchSize)
    const promises = batch.map(async (ticket) => {
      try {
        const response = await fetch(
          `${instance.BASE_URL}/Ticket/${ticket.ticket_id}/Ticket_User`,
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
        
        // Find assigned technician (type = 2)
        const assignedTech = data.find((actor: any) => actor.type === 2)
        if (!assignedTech || !assignedTech.users_id) return null
        
        // Get user details
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
        console.error(`Erro ao buscar técnico para ticket ${ticket.ticket_id}:`, error)
        return null
      }
    })
    
    const results = await Promise.all(promises)
    results.forEach((result, idx) => {
      if (result) {
        techMap.set(batch[idx].ticket_id, result)
      }
    })
    
    // Small delay between batches
    if (i + batchSize < tickets.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return techMap
}

async function syncInstance(instanceName: 'PETA' | 'GMX', resumePage: number = 0): Promise<SyncResult> {
  const instance = GLPI_INSTANCES[instanceName]
  
  console.log(`Iniciando sincronização de ${instanceName} (a partir da página ${resumePage})...`)
  console.log(`URL: ${instance.BASE_URL}`)
  
  try {
    // Verifica progresso anterior
    const { data: syncData } = await supabase
      .from('sync_control')
      .select('last_page, total_pages')
      .eq('instance', instanceName)
      .single()
    
    const startPage = resumePage || (syncData?.last_page || 0)
    console.log(`${instanceName}: Continuando da página ${startPage}`)
    
    const sessionToken = await initSession(instance)
    console.log(`${instanceName}: Sessão iniciada`)
    
    // Busca um range de páginas
    const { tickets: rawTickets, completed, lastPage, totalPages } = await getPageRange(instance, sessionToken, startPage, MAX_PAGES_PER_RUN)
    
    const tickets = processTickets(rawTickets, instanceName)
    const pagesProcessed = lastPage - startPage
    
    console.log(`${instanceName}: ${tickets.length} tickets processados (páginas ${startPage}-${lastPage-1})`)
    
    // Buscar técnicos para os tickets
    let techMap: Map<number, { name: string, id: number }> = new Map()
    if (tickets.length > 0) {
      console.log(`${instanceName}: Buscando técnicos...`)
      techMap = await fetchTechniciansForTickets(tickets, instance, sessionToken)
      
      // Atualiza os tickets com as informações do técnico
      tickets.forEach(ticket => {
        const tech = techMap.get(ticket.ticket_id)
        if (tech) {
          ticket.technician = tech.name
          ticket.technician_id = tech.id
        }
      })
    }
    
    if (tickets.length > 0) {
      // Upsert tickets em batch
      const batchSize = 100
      for (let i = 0; i < tickets.length; i += batchSize) {
        const batch = tickets.slice(i, i + batchSize)
        const { error } = await supabase
          .from('tickets_cache')
          .upsert(
            batch.map(t => ({
              ticket_id: t.ticket_id,
              instance: t.instance,
              title: t.title,
              entity: t.entity,
              entity_full: t.entity_full,
              category: t.category,
              root_category: t.root_category,
              status_id: t.status_id,
              status_key: t.status_key,
              status_name: t.status_name,
              group_name: t.group_name,
              technician: t.technician,
              technician_id: t.technician_id,
              date_created: t.date_created,
              date_mod: t.date_mod,
              due_date: t.due_date,
              is_sla_late: t.is_sla_late,
              last_sync: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })),
            { onConflict: 'ticket_id,instance' }
          )
        
        if (error) {
          console.error(`Erro ao salvar batch ${i}:`, error)
        }
      }
    }
    
    // Atualizar controle de sincronização
    await supabase
      .from('sync_control')
      .upsert({
        instance: instanceName,
        last_sync: new Date().toISOString(),
        status: completed ? 'success' : 'in_progress',
        tickets_count: (syncData?.total_pages ? syncData.total_pages * PAGE_SIZE : 0),
        last_page: lastPage,
        total_pages: totalPages,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'instance'
      })
    
    console.log(`${instanceName}: ${completed ? 'Sincronização concluída' : 'Página ' + lastPage + ' de ' + totalPages}`)
    return { 
      success: true, 
      count: tickets.length, 
      completed,
      pagesProcessed,
      lastPage,
      totalPages
    }
    
  } catch (error) {
    console.error(`${instanceName}: Erro na sincronização:`, error)
    
    await supabase
      .from('sync_control')
      .upsert({
        instance: instanceName,
        status: 'failed',
        error_message: error.message,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'instance'
      })
    
    return { success: false, error: error.message }
  }
}

Deno.serve(async (req) => {
  console.log('Iniciando job de sincronização...')
  
  const startTime = Date.now()
  
  // Permite especificar qual instância sincronizar (opcional)
  //Parâmetros: instance, reset_peta, reset_gmx
  const { instance, reset_peta, reset_gmx, resume_peta, resume_gmx } = await req.json().catch(() => ({}))
  
  try {
    // Verificar se precisa resetar (zerar e recomeçar)
    if (reset_peta) {
      console.log('Resetando PETA...')
      await supabase.from('sync_control').delete().eq('instance', 'PETA')
      await supabase.from('tickets_cache').delete().eq('instance', 'PETA')
    }
    if (reset_gmx) {
      console.log('Resetando GMX...')
      await supabase.from('sync_control').delete().eq('instance', 'GMX')
      await supabase.from('tickets_cache').delete().eq('instance', 'GMX')
    }
    
    // Determinar qual instância precisa de sincronização
    const { data: petaSync } = await supabase
      .from('sync_control')
      .select('last_page, total_pages, status')
      .eq('instance', 'PETA')
      .single()
    
    const { data: gmxSync } = await supabase
      .from('sync_control')
      .select('last_page, total_pages, status')
      .eq('instance', 'GMX')
      .single()
    
    // Decide qual instância processar (evita timeout processando ambas)
    let petaResult: SyncResult = { success: true, completed: true }
    let gmxResult: SyncResult = { success: true, completed: true }
    
    // Forçar sincronização se foi resetado ou não tem dados
    const petaHasData = petaSync && petaSync.last_page && petaSync.last_page > 0
    const gmxHasData = gmxSync && gmxSync.last_page && gmxSync.last_page > 0
    
    const petaNeedsSync = reset_peta || !petaHasData || !petaSync || !petaSync.last_page || petaSync.last_page < (petaSync.total_pages || 12)
    const gmxNeedsSync = reset_gmx || !gmxHasData || !gmxSync || !gmxSync.last_page || gmxSync.last_page < (gmxSync.total_pages || 78)
    
    // Processa apenas uma instância por vez para evitar timeout
    if (petaNeedsSync && (!gmxNeedsSync || (petaSync?.last_page || 0) <= (gmxSync?.last_page || 0))) {
      const startPagePeta = petaSync?.last_page || 0
      petaResult = await syncInstance('PETA', startPagePeta)
    } else if (gmxNeedsSync) {
      const startPageGmx = gmxSync?.last_page || 0
      gmxResult = await syncInstance('GMX', startPageGmx)
    }
    
    const duration = Date.now() - startTime
    
    // Log final
    const petaCompleted = petaResult.completed && petaResult.success
    const gmxCompleted = gmxResult.completed && gmxResult.success
    const allCompleted = petaCompleted && gmxCompleted
    const anyFailed = !petaResult.success || !gmxResult.success
    
    await supabase
      .from('sync_logs')
      .insert({
        instance: 'ALL',
        finished_at: new Date().toISOString(),
        status: allCompleted ? 'success' : (anyFailed ? 'failed' : 'partial'),
        tickets_processed: (petaResult.count || 0) + (gmxResult.count || 0),
        error_message: !petaResult.success ? petaResult.error : (!gmxResult.success ? gmxResult.error : null)
      })
    
    return new Response(
      JSON.stringify({
        success: !anyFailed,
        results: { 
          peta: petaResult, 
          gmx: gmxResult 
        },
        duration_ms: duration,
        needsResume: !allCompleted,
        message: petaResult.completed ? 'PETA completo' : (gmxResult.completed ? 'GMX completo' : 'Progresso salvo')
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