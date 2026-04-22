import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import config from '@/lib/config'

const VALID_INSTANCES = ['PETA', 'GMX']

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const instance = (searchParams.get('instance') || '').toUpperCase()

  if (!VALID_INSTANCES.includes(instance)) {
    return NextResponse.json(
      { error: 'Instancia invalida. Use PETA ou GMX.' },
      { status: 400 }
    )
  }

  const supabase = createClient(config.supabase.url, config.supabase.anonKey)

  const { data, error } = await supabase
    .from('tickets_cache')
    .select('*')
    .eq('instance', instance)
    .order('date_mod', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
