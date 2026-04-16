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

// Normalize URLs
const normalizeUrl = (url) => {
    if (!url) return '';
    return url.replace(/\/auth\/v1(\/.*)?$/, '').replace(/\/$/, '');
};

// Try to read from various sources (window, window.APP_CONFIG, config.local.js)
const getEnv = (key) => {
    // Try window[key] (Vercel exposes all vars this way)
    if (typeof window !== 'undefined' && window[key]) return window[key];
    // Try window.APP_CONFIG[key]
    if (window.APP_CONFIG?.[key]) return window.APP_CONFIG[key];
    return undefined;
};

window.APP_CONFIG = window.APP_CONFIG || window.APP_CONFIG_WITH_LOCAL || {
    SUPABASE_URL: normalizeUrl(getEnv('SUPABASE_URL') || ''),
    SUPABASE_ANON_KEY: getEnv('SUPABASE_ANON_KEY') || '',
    GLPI_PETA_URL: getEnv('GLPI_PETA_URL') || '',
    GLPI_PETA_USER_TOKEN: getEnv('GLPI_PETA_USER_TOKEN') || '',
    GLPI_PETA_APP_TOKEN: getEnv('GLPI_PETA_APP_TOKEN') || '',
    GLPI_GMX_URL: getEnv('GLPI_GMX_URL') || '',
    GLPI_GMX_USER_TOKEN: getEnv('GLPI_GMX_USER_TOKEN') || '',
    GLPI_GMX_APP_TOKEN: getEnv('GLPI_GMX_APP_TOKEN') || '',
    GLPI_PETA_TICKET_URL: getEnv('GLPI_PETA_TICKET_URL') || '',
    GLPI_GMX_TICKET_URL: getEnv('GLPI_GMX_TICKET_URL') || ''
};

const isConfigured = window.APP_CONFIG?.SUPABASE_URL && window.APP_CONFIG?.GLPI_PETA_URL;
console.log('[CONFIG] Status:', isConfigured ? 'OK' : 'FALTANDO credenciais');
console.log('[CONFIG] SUPABASE_URL:', window.APP_CONFIG?.SUPABASE_URL ? 'OK' : 'FALTANDO');
console.log('[CONFIG] GLPI_PETA_URL:', window.APP_CONFIG?.GLPI_PETA_URL || 'não configurado');
console.log('[CONFIG] GLPI_GMX_URL:', window.APP_CONFIG?.GLPI_GMX_URL || 'não configurado');
console.log('[CONFIG] SUPABASE_URL:', window.APP_CONFIG?.SUPABASE_URL ? 'OK' : 'FALTANDO');
console.log('[CONFIG] GLPI_PETA_URL:', window.APP_CONFIG?.GLPI_PETA_URL || 'não configurado');
console.log('[CONFIG] GLPI_GMX_URL:', window.APP_CONFIG?.GLPI_GMX_URL || 'não configurado');