/**
 * Configuração Central - Build Time + Local Fallback
 * 
 * PRODUÇÃO (Vercel): config-generated.js é criado no build com env vars
 * DESENVOLVIMENTO: config.local.js com window.APP_CONFIG_WITH_LOCAL
 * 
 * Variáveis Vercel (configure em Project Settings > Environment Variables):
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - NEXT_PUBLIC_GLPI_PETA_URL
 * - PETA_USER_TOKEN, PETA_APP_TOKEN
 * - NEXT_PUBLIC_GLPI_GMX_URL
 * - GMX_USER_TOKEN, GMX_APP_TOKEN
 * - NEXT_PUBLIC_GLPI_PETA, NEXT_PUBLIC_GLPI_GMX
 */

// Try config-generated.js first (Vercel build-time)
if (typeof window.APP_CONFIG === 'undefined') {
    // Development fallback: config.local.js
    window.APP_CONFIG = window.APP_CONFIG_WITH_LOCAL || {
        SUPABASE_URL: '',
        SUPABASE_ANON_KEY: '',
        GLPI_PETA_URL: '',
        GLPI_PETA_USER_TOKEN: '',
        GLPI_PETA_APP_TOKEN: '',
        GLPI_GMX_URL: '',
        GLPI_GMX_USER_TOKEN: '',
        GLPI_GMX_APP_TOKEN: '',
        GLPI_PETA_TICKET_URL: '',
        GLPI_GMX_TICKET_URL: ''
    };
}

// Normalize URLs
const normalizeUrl = (url) => {
    if (!url) return '';
    return url.replace(/\/auth\/v1(\/.*)?$/, '').replace(/\/$/, '');
};

if (window.APP_CONFIG?.SUPABASE_URL) {
    window.APP_CONFIG.SUPABASE_URL = normalizeUrl(window.APP_CONFIG.SUPABASE_URL);
}

const isConfigured = window.APP_CONFIG?.SUPABASE_URL && window.APP_CONFIG?.GLPI_PETA_URL;
console.log('[CONFIG] Status:', isConfigured ? 'OK' : 'FALTANDO credenciais');
console.log('[CONFIG] SUPABASE_URL:', isConfigured ? 'OK' : 'FALTANDO');
console.log('[CONFIG] GLPI_PETA_URL:', window.APP_CONFIG?.GLPI_PETA_URL || 'não configurado');
console.log('[CONFIG] GLPI_GMX_URL:', window.APP_CONFIG?.GLPI_GMX_URL || 'não configurado');