import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_INSTANCES = ['PETA', 'GMX']
const VALID_DATE_FIELDS = ['date_created', 'date_mod', 'date_solved']
const DEFAULT_PAGE_SIZE = 200
const MAX_PAGE_SIZE = 500

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

    const pageSize = end - start + 1
    const hasMore = tickets.length === pageSize

    return NextResponse.json({
      data: tickets,
      pagination: {
        start,
        end,
        pageSize,
        loaded: tickets.length,
        hasMore,
        nextStart: hasMore ? end + 1 : null,
      },
    })
  } catch (e) {
    console.error('API Error:', e.message)
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 })
  }
}