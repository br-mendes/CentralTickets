import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_INSTANCES = ['PETA', 'GMX']
const DEFAULT_PAGE_SIZE = 200
const MAX_PAGE_SIZE = 1000

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const rawInstance = (searchParams.get('instance') || '').toUpperCase()
  
  // Support different parameter names from various frontends
  const startParam = Number.parseInt(searchParams.get('start') || searchParams.get('cursorId') || '0', 10)
  const limitParam = Number.parseInt(searchParams.get('limit') || searchParams.get('end') || '200', 10)
  const endParam = startParam + limitParam - 1

  let start = Number.isNaN(startParam) || startParam < 0 ? 0 : startParam
  let end = Number.isNaN(endParam) || endParam < start ? start + DEFAULT_PAGE_SIZE - 1 : endParam
  if (end - start + 1 > MAX_PAGE_SIZE) {
    end = start + MAX_PAGE_SIZE - 1
  }

  const instances = rawInstance
    ? rawInstance.split(',').map(v => v.trim()).filter(Boolean)
    : VALID_INSTANCES

  if (instances.length === 0 || instances.some(v => !VALID_INSTANCES.includes(v))) {
    return NextResponse.json(
      { error: 'Instancia invalida. Use PETA, GMX ou vazio para ambas.' },
      { status: 400 }
    )
  }

  // Read environment variables directly
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars:', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey })
    return NextResponse.json(
      { error: 'Configuração incompleta. Verifique as variáveis de ambiente.' },
      { status: 500 }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. Fetch tickets
  let query = supabase
    .from('tickets_cache')
    .select('*', { count: 'exact' })
    .in('instance', instances)
    .order('date_mod', { ascending: false })
    .range(start, end)

  const { data: tickets, error, count } = await query

  if (error) {
    console.error('Supabase error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!tickets || tickets.length === 0) {
    return NextResponse.json({ data: [], pagination: { total: 0, loaded: 0, hasMore: false } })
  }

  // 2. Enrich with related data (users, entities, groups, request types)
  const userIds = {}, entityIds = {}, groupIds = {}, requestTypeIds = {}
  for (const t of tickets) {
    const inst = t.instance || ''
    if (t.requester_id) {
      if (!userIds[inst]) userIds[inst] = new Set()
      userIds[inst].add(t.requester_id)
    }
    if (t.entity_id) {
      if (!entityIds[inst]) entityIds[inst] = new Set()
      entityIds[inst].add(t.entity_id)
    }
    if (t.group_id) {
      if (!groupIds[inst]) groupIds[inst] = new Set()
      groupIds[inst].add(t.group_id)
    }
    if (t.request_type_id) {
      if (!requestTypeIds[inst]) requestTypeIds[inst] = new Set()
      requestTypeIds[inst].add(t.request_type_id)
    }
  }

  // Fetch maps
  const [usersMap, entitiesMap, groupsMap, requestTypesMap] = await Promise.all([
    (async () => {
      const map = {}
      for (const inst of Object.keys(userIds)) {
        const ids = [...userIds[inst]]
        if (ids.length === 0) continue
        const { data } = await supabase
          .from('glpi_users')
          .select('id, fullname')
          .eq('instance', inst)
          .in('id', ids)
        if (data) data.forEach(u => { map[`${inst}:${u.id}`] = u.fullname })
      }
      return map
    })(),
    (async () => {
      const map = {}
      for (const inst of Object.keys(entityIds)) {
        const ids = [...entityIds[inst]]
        if (ids.length === 0) continue
        const { data } = await supabase
          .from('glpi_entities')
          .select('id, name')
          .eq('instance', inst)
          .in('id', ids)
        if (data) data.forEach(e => { map[`${inst}:${e.id}`] = e.name })
      }
      return map
    })(),
    (async () => {
      const map = {}
      for (const inst of Object.keys(groupIds)) {
        const ids = [...groupIds[inst]]
        if (ids.length === 0) continue
        const { data } = await supabase
          .from('glpi_groups')
          .select('id, name')
          .eq('instance', inst)
          .in('id', ids)
        if (data) data.forEach(g => { map[`${inst}:${g.id}`] = g.name })
      }
      return map
    })(),
    (async () => {
      const map = {}
      for (const inst of Object.keys(requestTypeIds)) {
        const ids = [...requestTypeIds[inst]]
        if (ids.length === 0) continue
        const { data } = await supabase
          .from('glpi_request_types')
          .select('id, name')
          .eq('instance', inst)
          .in('id', ids)
        if (data) data.forEach(rt => { map[`${inst}:${rt.id}`] = rt.name })
      }
      return map
    })(),
  ])

  // Merge into tickets and calculate SLA percentages
  const now = Date.now()
  const enriched = tickets.map(t => {
    const inst = t.instance || ''
    const userKey = `${inst}:${t.requester_id}`
    const entityKey = `${inst}:${t.entity_id}`
    const groupKey = `${inst}:${t.group_id}`
    const requestTypeKey = `${inst}:${t.request_type_id}`
    
    // Calculate SLA percentage based on due_date
    let slaPercentage = 0
    if (t.due_date) {
      const created = new Date(t.date_created).getTime()
      const due = new Date(t.due_date).getTime()
      const elapsed = now - created
      const total = due - created
      if (total > 0) {
        slaPercentage = Math.min(100, Math.max(0, (elapsed / total) * 100))
      }
      // If overdue, show 100%
      if (t.is_sla_late || t.is_overdue_first) {
        slaPercentage = 100
      }
    }
    
    return {
      ...t,
      requester_name: usersMap[userKey] || t.requester || '',
      entity_name: entitiesMap[entityKey] || t.entity || '',
      group_name: groupsMap[groupKey] || t.group_name || '',
      channel_name: requestTypesMap[requestTypeKey] || t.request_type || '',
      technician_name: usersMap[`${inst}:${t.technician_id}`] || t.technician || '',
      sla_percentage_first: slaPercentage,
      sla_percentage_resolve: slaPercentage,
    }
  })

  const safeCount = typeof count === 'number' ? count : tickets.length
  const loaded = enriched.length
  const hasMore = start + loaded < safeCount

  return NextResponse.json({
    data: enriched,
    pagination: {
      start,
      end,
      total: safeCount,
      loaded,
      hasMore,
    },
  })
}
