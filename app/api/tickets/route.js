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

  // Safe pagination
  let start = Math.max(0, startParam)
  let end = Math.max(start, endParam)
  const pageSize = Math.min(MAX_PAGE_SIZE, end - start + 1)
  end = start + pageSize - 1

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
      console.error('Supabase query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Enrichment maps (optional, keeps max 100 per page)
    const enriched = tickets?.length
      ? await enrichTicketsWithReferences(tickets, supabase)
      : []

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
    console.error('API Route Error:', e?.message || e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Lightweight enrichment using IDs (batched)
async function enrichTicketsWithReferences(tickets, supabase) {
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
  async function fetchIdsInBatches(table, idsByInstance, selectFields) {
    const map = {}
    for (const inst of Object.keys(idsByInstance)) {
      const ids = [...idsByInstance[inst]]
      if (!ids.length) continue
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
            const field = selectFields.split(',')[1].trim()
            data.forEach(row => { map[`${inst}:${row.id}`] = row[field] })
          }
        } catch (e) {
          // ignore per-batch errors to keep partial enrichment
        }
      }
    }
    return map
  }
  const [usersMap, entitiesMap, groupsMap, requestTypesMap] = await Promise.all([
    fetchIdsInBatches('glpi_users', userIds, 'id, fullname'),
    fetchIdsInBatches('glpi_entities', entityIds, 'id, name'),
    fetchIdsInBatches('glpi_groups', groupIds, 'id, name'),
    fetchIdsInBatches('glpi_request_types', requestTypeIds, 'id, name'),
  ])
  return tickets.map(t => {
    const inst = t.instance || ''
    const requesterName = usersMap[`${inst}:${t.requester_id}`] || t.requester || ''
    const entityName = entitiesMap[`${inst}:${t.entity_id}`] || t.entity || ''
    const groupName = groupsMap[`${inst}:${t.group_id}`] || t.group_name || ''
    const channelName = requestTypesMap[`${inst}:${t.request_type_id}`] || t.request_type || ''
    return { ...t, requester_name: requesterName, entity_name: entityName, group_name: groupName, channel_name: channelName }
  })
}
