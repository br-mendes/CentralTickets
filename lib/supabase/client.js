// lib/supabase/client.js - Cliente Supabase para Client Components
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import config from '../../lib/config'

let supabaseClient

export function getSupabaseClient() {
  if (!supabaseClient) {
    if (!config.supabase.url || !config.supabase.anonKey) {
      console.warn('[Supabase] URL ou chave ausente — cliente não inicializado.')
      return null
    }
    try {
      supabaseClient = createClientComponentClient({
        supabaseUrl: config.supabase.url,
        supabaseKey: config.supabase.anonKey,
      })
    } catch (e) {
      console.error('[Supabase] Falha ao criar cliente:', e)
      return null
    }
  }
  return supabaseClient
}