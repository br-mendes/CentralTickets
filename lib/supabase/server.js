// lib/supabase/server.js - Cliente Supabase para Server Components
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import config from '../../lib/config'

let supabaseServerClient

export function getSupabaseServerClient() {
  if (!supabaseServerClient) {
    supabaseServerClient = createServerComponentClient({
      cookies,
      supabaseUrl: config.supabase.url,
      supabaseKey: config.supabase.anonKey,
    })
  }
  return supabaseServerClient
}