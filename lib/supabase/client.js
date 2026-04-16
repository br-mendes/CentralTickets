// lib/supabase/client.js - Cliente Supabase para Client Components
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import config from '@/lib/config'

let supabaseClient

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClientComponentClient({
      supabaseUrl: config.supabase.url,
      supabaseKey: config.supabase.anonKey,
    })
  }
  return supabaseClient
}