import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_INSTANCES = ['PETA', 'GMX']
const VALID_DATE_FIELDS = ['date_created', 'date_mod', 'date_solved']
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 100

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    let query = supabase
      .from('tickets_cache')
      .select('*')
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

    const { data: tickets, error } = await query

    if (error) {
      console.error('Supabase error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!tickets || tickets.length === 0) {
      return NextResponse.json({ data: [], pagination: { start, end, loaded: 0, total: 0, hasMore: false } })
    }

    // Collect unique IDs per instance for enrichment
    const userIds = {}
    const entityIds = {}
    const groupIds = {}
    const requestTypeIds = {}

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

    // Helper to fetch IDs in batches
    async function fetchIdsInBatches(table, idsByInstance, selectFields) {
      const map = {}
      for (const inst of Object.keys(idsByInstance)) {
        const ids = [...idsByInstance[inst]]
        if (ids.length === 0) continue
        const batchSize = 50
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize)
          try {
            const { data } = await supabase
              .from(table)
              .select(selectFields)
              .eq('instance', inst)
              .in('id', batch)
            if (data) {
              const keyField = selectFields.split(',')[1].trim()
              data.forEach(row => { map[`${inst}:${row.id}`] = row[keyField] })
            }
          } catch (e) {
            console.error(`Error fetching ${table} for ${inst}:`, e.message)
          }
        }
      }
      return map
    }

    // Fetch maps with batching
    const [
      usersMap,
      entitiesMap,
      groupsMap,
      requestTypesMap
    ] = await Promise.all([
      fetchIdsInBatches('glpi_users', userIds, 'id, fullname'),
      fetchIdsInBatches('glpi_entities', entityIds, 'id, name'),
      fetchIdsInBatches('glpi_groups', groupIds, 'id, name'),
      fetchIdsInBatches('glpi_request_types', requestTypeIds, 'id, name'),
    ])

    // Merge into tickets
    const enriched = tickets.map(t => {
      const inst = t.instance || ''
      const userKey = `${inst}:${t.requester_id}`
      const entityKey = `${inst}:${t.entity_id}`
      const groupKey = `${inst}:${t.group_id}`
      const requestTypeKey = `${inst}:${t.request_type_id}`
      return {
        ...t,
        requester_name: usersMap[userKey] || t.requester || '',
        entity_name: entitiesMap[entityKey] || t.entity || '',
        group_name: groupsMap[groupKey] || t.group_name || '',
        channel_name: requestTypesMap[requestTypeKey] || t.request_type || '',
      }
    })

    const pageSize = end - start + 1
    const loaded = enriched.length
    const hasMore = loaded === pageSize

    return NextResponse.json({
      data: enriched,
      pagination: {
        start,
        end,
        pageSize,
        loaded,
        hasMore,
        nextStart: hasMore ? end + 1 : null,
      },
    })
  } catch (e) {
    console.error('API Error:', e.message)
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 })
  }
}