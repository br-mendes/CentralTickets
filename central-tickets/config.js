/**
 * Configuração Central de Tokens - SECURITY NOTICE
 *
 * ATENÇÃO: Para produção, use variáveis de ambiente do Vercel!
 *
 * Configure em: Vercel Dashboard > Project Settings > Environment Variables
 *
 * Variáveis necessárias:
 * - SUPABASE_URL (ex: https://xxx.supabase.co)
 * - SUPABASE_ANON_KEY (ex: eyJhbGc...)
 * - GLPI_PETA_URL, GLPI_PETA_USER_TOKEN, GLPI_PETA_APP_TOKEN
 * - GLPI_GMX_URL, GLPI_GMX_USER_TOKEN, GLPI_GMX_APP_TOKEN
 * - GLPI_PETA_TICKET_URL, GLPI_GMX_TICKET_URL
 *
 * Para desenvolvimento local:
 * 1. Crie um arquivo config.local.js (NÃO COMMITAR!)
 * 2. Defina window.APP_CONFIG_WITH_LOCAL = { ... }
 * 3. Inclua este arquivo antes de config.js no HTML
 */

// Normalize URLs (remove trailing /auth/v1/callback from Vercel env vars)
const normalizeUrl = (url) => {
    if (!url) return '';
    return url.replace(/\/auth\/v1(\/.*)?$/, '').replace(/\/$/, '');
};

// Try to read from window.APP_CONFIG or Vercel env vars (NEXT_PUBLIC_*)
const getEnv = (key) => {
    // First check window.APP_CONFIG (from config.local.js or pre-filled)
    if (window.APP_CONFIG?.[key]) return window.APP_CONFIG[key];
    // Then check NEXT_PUBLIC_* from Vercel
    if (typeof window !== 'undefined' && window[key]) return window[key];
    // Finally check process.env (server-side only, but Vercel exposes NEXT_PUBLIC_ as window)
    return undefined;
};

window.APP_CONFIG = window.APP_CONFIG || window.APP_CONFIG_WITH_LOCAL || {
    SUPABASE_URL: getEnv('NEXT_PUBLIC_SUPABASE_URL') || '',
    SUPABASE_ANON_KEY: getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || '',
    GLPI_PETA_URL: getEnv('NEXT_PUBLIC_GLPI_PETA_URL') || '',
    GLPI_PETA_USER_TOKEN: getEnv('GLPI_PETA_USER_TOKEN') || '',
    GLPI_PETA_APP_TOKEN: getEnv('GLPI_PETA_APP_TOKEN') || '',
    GLPI_GMX_URL: getEnv('NEXT_PUBLIC_GLPI_GMX_URL') || '',
    GLPI_GMX_USER_TOKEN: getEnv('GLPI_GMX_USER_TOKEN') || '',
    GLPI_GMX_APP_TOKEN: getEnv('GLPI_GMX_APP_TOKEN') || '',
    GLPI_PETA_TICKET_URL: getEnv('NEXT_PUBLIC_GLPI_PETA_TICKET_URL') || '',
    GLPI_GMX_TICKET_URL: getEnv('NEXT_PUBLIC_GLPI_GMX_TICKET_URL') || ''
};

// Apply URL normalization
if (window.APP_CONFIG.SUPABASE_URL) {
    window.APP_CONFIG.SUPABASE_URL = normalizeUrl(window.APP_CONFIG.SUPABASE_URL);
}

const isConfigured = window.APP_CONFIG?.SUPABASE_URL && window.APP_CONFIG?.GLPI_PETA_URL;
console.log('[CONFIG] Status:', isConfigured ? 'Configurado' : 'FALTANDO credenciais');
console.log('[CONFIG] Source:', window.APP_CONFIG_WITH_LOCAL ? 'config.local.js' : 'NEXT_PUBLIC_* (Vercel)');
console.log('[CONFIG] SUPABASE_URL:', isConfigured ? 'OK' : 'FALTANDO');
console.log('[CONFIG] GLPI_PETA_URL:', window.APP_CONFIG?.GLPI_PETA_URL || 'não configurado');
console.log('[CONFIG] GLPI_GMX_URL:', window.APP_CONFIG?.GLPI_GMX_URL || 'não configurado');
console.log('[CONFIG] SUPABASE_URL:', window.APP_CONFIG?.SUPABASE_URL ? 'OK' : 'FALTANDO');
console.log('[CONFIG] GLPI_PETA_URL:', window.APP_CONFIG?.GLPI_PETA_URL || 'não configurado');
console.log('[CONFIG] GLPI_GMX_URL:', window.APP_CONFIG?.GLPI_GMX_URL || 'não configurado');