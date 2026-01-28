import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'

export const runtime = 'nodejs'

export async function GET() {
  try {
    getSupabaseAdmin()
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
