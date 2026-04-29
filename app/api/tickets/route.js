import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_INSTANCES = ['PETA', 'GMX']
const DEFAULT_LIMIT = 1000
const MAX_LIMIT = 1000

const COLS = [
  'ticket_id','instance','title','entity','status_id','status_key',
  'type_id','priority_id','urgency','is_sla_late','is_overdue_resolve','due_date',
  'date_created','date_mod','date_solved','technician','technician_id',
  'requester','requester_id','requester_fullname',
  'group_name','root_category','request_type',
  'resolution_duration','waiting_duration','is_deleted',
].join(',')

const ONE_YEAR_MS = 365 * 86400 * 1000

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export async function GET(request) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase config missing' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const rawInstance = searchParams.get('instance')?.toUpperCase() || 'PETA,GMX'
  const cursorDate = searchParams.get('cursorDate')
  const cursorId = searchParams.get('cursorId')
  const limitParam = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10)
  const includeDeleted = searchParams.get('includeDeleted') === 'true'
  const statusesParam = searchParams.get('statuses') || ''
  const typeIdParam = searchParams.get('typeId') || ''

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitParam) ? limitParam : DEFAULT_LIMIT))

  const instances = rawInstance.split(',').map(v => v.trim()).filter(Boolean)
  if (instances.length === 0 || instances.some(v => !VALID_INSTANCES.includes(v))) {
    return NextResponse.json({ error: 'Invalid instance. Use PETA, GMX or PETA,GMX' }, { status: 400 })
  }

  const statuses = statusesParam.split(',').map(v => v.trim()).filter(Boolean)
  const typeId = typeIdParam ? parseInt(typeIdParam, 10) : null

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const oneYearAgo = new Date(Date.now() - ONE_YEAR_MS).toISOString()

    let query = supabase
      .from('tickets_cache')
      .select(COLS)
      .in('instance', instances)
      .or(`status_key.not.in.(closed,solved),date_created.gte.${oneYearAgo}`)
      .order('date_mod', { ascending: false })
      .order('ticket_id', { ascending: false })
      .limit(limit)

    if (!includeDeleted) {
      query = query.neq('is_deleted', true)
    }

    if (statuses.length > 0) {
      query = query.in('status_key', statuses)
    }

    if (typeId !== null && !isNaN(typeId)) {
      query = query.eq('type_id', typeId)
    }

    // Cursor-based pagination
    const parsedCursorId = parseInt(cursorId, 10)
    if (cursorDate && cursorId && !isNaN(Date.parse(cursorDate)) && !isNaN(parsedCursorId)) {
      query = query.or(`date_mod.lt.${cursorDate},and(date_mod.eq.${cursorDate},ticket_id.lt.${parsedCursorId})`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Supabase error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const tickets = data || []
    const nextCursor = tickets.length === limit
      ? { date_mod: tickets[limit - 1].date_mod, ticket_id: tickets[limit - 1].ticket_id }
      : undefined

    return NextResponse.json({
      tickets,
      nextCursor: nextCursor || undefined,
      hasMore: !!nextCursor,
    })
  } catch (e) {
    console.error('API Error:', e?.message || e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}