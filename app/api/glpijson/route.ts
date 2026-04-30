import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const instance = searchParams.get('instance') || 'PETA'
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  
  console.log('[glpijson API] instance:', instance)
  
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Configuração incompleta' }, { status: 500 })
  }
  
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/glpijson?instance=${instance}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    })
    
    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json({ error: `Edge function error: ${res.status} - ${errorText}` }, { status: res.status })
    }
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}