import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_INSTANCES = ['PETA', 'GMX']
const DEFAULT_PAGE_SIZE = 100

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const rawInstance = (searchParams.get('instance') || '').toUpperCase()
  const startParam = Number.parseInt(searchParams.get('start') || '0', 10)
  const endParam = Number.parseInt(searchParams.get('end') || `${DEFAULT_PAGE_SIZE - 1}`, 10)
  const statusesParam = searchParams.get('statuses') || ''
  const typeIdParam = searchParams.get('typeId') || ''
  const includeDeleted = searchParams.get('includeDeleted') === 'true'

  let start = Math.max(0, startParam)
  let end = Math.max(start, endParam)
  const pageSize = Math.min(100, end - start + 1)
  end = start + pageSize - 1

  const instances = rawInstance
    ? rawInstance.split(',').map(v => v.trim()).filter(Boolean)
    : VALID_INSTANCES

  if (instances.length === 0 || instances.some(v => !VALID_INSTANCES.includes(v))) {
    return NextResponse.json({ error: 'Instancia invalida' }, { status: 400 })
  }

  const statuses = statusesParam.split(',').map(v => v.trim()).filter(Boolean)
  const typeId = typeIdParam ? Number.parseInt(typeIdParam, 10) : null
  if (typeIdParam && Number.isNaN(typeId)) {
    return NextResponse.json({ error: 'typeId invalido' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    let query = supabase
      .from('tickets_cache')
      .select('*')
      .in('instance', instances)
      .order('date_mod', { ascending: false })
      .range(start, end)

    if (!includeDeleted) query = query.eq('is_deleted', false)
    if (statuses.length > 0) query = query.in('status_key', statuses)
    if (typeId !== null) query = query.eq('type_id', typeId)

    const { data: tickets, error } = await query

    if (error) {
      console.error('DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: tickets || [],
      pagination: {
        start,
        end,
        pageSize,
        loaded: (tickets || []).length,
        hasMore: (tickets || []).length === pageSize,
        nextStart: (tickets || []).length === pageSize ? end + 1 : null,
      },
    })
  } catch (e) {
    console.error('API Error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}