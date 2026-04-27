import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import config from '@/lib/config'

const VALID_INSTANCES = ['PETA', 'GMX']
const VALID_DATE_FIELDS = ['date_created', 'date_mod', 'date_solved']
const DEFAULT_PAGE_SIZE = 200
const MAX_PAGE_SIZE = 1000

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const rawInstance = (searchParams.get('instance') || '').toUpperCase()
  const startParam = Number.parseInt(searchParams.get('start') || '0', 10)
  const endParam = Number.parseInt(searchParams.get('end') || `${DEFAULT_PAGE_SIZE - 1}`, 10)
  const statusesParam = searchParams.get('statuses') || ''
  const typeIdParam = searchParams.get('typeId') || ''
  const dateFieldParam = searchParams.get('dateField') || 'date_mod'
  const fromDate = searchParams.get('fromDate') || ''
  const toDate = searchParams.get('toDate') || ''
  const includeDeleted = searchParams.get('includeDeleted') === 'true'

  let start = Number.isNaN(startParam) || startParam < 0 ? 0 : startParam
  let end = Number.isNaN(endParam) || endParam < start ? start + DEFAULT_PAGE_SIZE - 1 : endParam
  if (end - start + 1 > MAX_PAGE_SIZE) {
    end = start + MAX_PAGE_SIZE - 1
  }

  const dateField = VALID_DATE_FIELDS.includes(dateFieldParam) ? dateFieldParam : 'date_mod'

  const instances = rawInstance
    ? rawInstance.split(',').map(v => v.trim()).filter(Boolean)
    : VALID_INSTANCES

  if (instances.length === 0 || instances.some(v => !VALID_INSTANCES.includes(v))) {
    return NextResponse.json(
      { error: 'Instancia invalida. Use PETA, GMX ou vazio para ambas.' },
      { status: 400 }
    )
  }

  const statuses = statusesParam
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)

  const typeId = typeIdParam ? Number.parseInt(typeIdParam, 10) : null
  if (typeIdParam && Number.isNaN(typeId)) {
    return NextResponse.json(
      { error: 'typeId invalido.' },
      { status: 400 }
    )
  }

  const supabase = createClient(config.supabase.url, config.supabase.anonKey)

  // 1. Fetch tickets
  let query = supabase
    .from('tickets_cache')
    .select('*', { count: 'exact' })
    .in('instance', instances)
    .order(dateField, { ascending: false })
    .range(start, end)

  if (!includeDeleted) {
    query = query.eq('is_deleted', false)
  }

  if (statuses.length > 0) {
    query = query.in('status_key', statuses)
  }

  if (typeId !== null) {
    query = query.eq('type_id', typeId)
  }

  if (fromDate) {
    query = query.gte(dateField, fromDate)
  }

  if (toDate) {
    query = query.lte(dateField, toDate)
  }

  const { data: tickets, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 2. Enrich with related data (users, entities, groups, request types)
  // Collect unique IDs per instance
  const userIds = {}, entityIds = {}, groupIds = {}, requestTypeIds = {}, technicianIds = {}
  for (const t of tickets) {
    const inst = t.instance || ''
    if (t.requester_id) {
      if (!userIds[inst]) userIds[inst] = new Set()
      userIds[inst].add(t.requester_id)
    }
    if (t.assignee_id || t.technician_id) {
      const techId = t.assignee_id || t.technician_id
      if (!technicianIds[inst]) technicianIds[inst] = new Set()
      technicianIds[inst].add(techId)
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
  const [usersMap, entitiesMap, groupsMap, requestTypesMap, techniciansMap] = await Promise.all([
    // users
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
    // entities
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
    // groups
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
    // request types
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
    // technicians
    (async () => {
      const map = {}
      for (const inst of Object.keys(technicianIds)) {
        const ids = [...technicianIds[inst]]
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
  ])

  // Merge into tickets
  const enriched = tickets.map(t => {
    const inst = t.instance || ''
    const userKey = `${inst}:${t.requester_id}`
    const entityKey = `${inst}:${t.entity_id}`
    const groupKey = `${inst}:${t.group_id}`
    const requestTypeKey = `${inst}:${t.request_type_id}`
    const techId = t.assignee_id || t.technician_id
    const technicianKey = `${inst}:${techId}`
    return {
      ...t,
      requester_name: usersMap[userKey] || t.requester || '',
      entity_name: entitiesMap[entityKey] || t.entity || '',
      group_name: groupsMap[groupKey] || t.group_name || '',
      channel_name: requestTypesMap[requestTypeKey] || t.request_type || '',
      technician_name: techniciansMap[technicianKey] || t.technician || '',
    }
  })

  const safeCount = typeof count === 'number' ? count : tickets.length
  const pageSize = end - start + 1
  const loaded = enriched.length
  const nextStart = start + loaded
  const hasMore = nextStart < safeCount && loaded === pageSize

  return NextResponse.json({
    data: enriched,
    pagination: {
      start,
      end,
      pageSize,
      loaded,
      total: safeCount,
      hasMore,
      nextStart: hasMore ? nextStart : null,
    },
  })
}
