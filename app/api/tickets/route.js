import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_INSTANCES = ['PETA', 'GMX']
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

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
  const limitParam = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT))
  const includeDeleted = searchParams.get('includeDeleted') === 'true'

  const limit = Math.min(MAX_LIMIT, Math.max(1, limitParam))

  const instances = rawInstance.split(',').map(v => v.trim()).filter(Boolean)
  if (instances.length === 0 || instances.some(v => !VALID_INSTANCES.includes(v))) {
    return NextResponse.json({ error: 'Invalid instance' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    let query = supabase
      .from('tickets_cache')
      .select('*')
      .in('instance', instances)
      .order('date_mod', { ascending: false })
      .order('ticket_id', { ascending: false })
      .limit(limit)

    if (!includeDeleted) {
      query = query.eq('is_deleted', false)
    }

    // Cursor-based pagination
    if (cursorDate && cursorId) {
      query = query.lt('date_mod', cursorDate).lt('ticket_id', parseInt(cursorId))
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
      nextCursor,
      hasMore: !!nextCursor,
    })
  } catch (e) {
    console.error('API Error:', e?.message || e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}