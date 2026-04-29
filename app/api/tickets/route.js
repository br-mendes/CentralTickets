import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function GET(request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Simple test query - get first 10 tickets
    const { data, error } = await supabase
      .from('tickets_cache')
      .select('*')
      .limit(10)
    
    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    return NextResponse.json({ data: data || [] })
  } catch (e) {
    console.error('Route error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}