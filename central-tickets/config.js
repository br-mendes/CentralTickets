/**
 * Configuração Central de Tickets
 * 
 * Para Vercel: Configure as Environment Variables em:
 * Project Settings > Environment Variables
 * 
 * NOTA: SUPABASE_URL e SUPABASE_ANON_KEY são públicos e podem ser expostos.
 * Os tokens GLPI são sensíveis e devem ser usados apenas em Edge Functions.
 */

// Try to get config from different sources
let envConfig = {};

// 1. Try process.env (works during build or in Edge Functions)
if (typeof process !== 'undefined' && process.env) {
    envConfig = {
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
        GLPI_PETA_URL: process.env.PETA_BASE_URL || process.env.GLPI_PETA_URL || '',
        GLPI_PETA_USER_TOKEN: process.env.PETA_USER_TOKEN || '',
        GLPI_PETA_APP_TOKEN: process.env.PETA_APP_TOKEN || '',
        GLPI_GMX_URL: process.env.GMX_BASE_URL || process.env.GLPI_GMX_URL || '',
        GLPI_GMX_USER_TOKEN: process.env.GMX_USER_TOKEN || '',
        GLPI_GMX_APP_TOKEN: process.env.GMX_APP_TOKEN || '',
    };
}

// 2. Check if already set by Vercel in production
if (typeof window !== 'undefined' && window.__VERCEL_ENV__) {
    // Vercel may inject env vars here
}

window.APP_CONFIG = window.APP_CONFIG || envConfig;

// Fill in ticket URLs
window.APP_CONFIG.GLPI_PETA_TICKET_URL = 'https://glpi.petacorp.com.br/front/ticket.form.php?id=';
window.APP_CONFIG.GLPI_GMX_TICKET_URL = 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id=';

// Validate
const hasSupabase = window.APP_CONFIG.SUPABASE_URL && window.APP_CONFIG.SUPABASE_ANON_KEY;

if (!hasSupabase) {
    console.warn('[CONFIG] AVISO: Configuração do Supabase incompleta');
    console.warn('[CONFIG] Defina SUPABASE_URL e SUPABASE_ANON_KEY no Vercel Dashboard');
} else {
    console.log('[CONFIG] Supabase configurado:', window.APP_CONFIG.SUPABASE_URL);
}

// Log GLPI status (tokens should be used server-side only)
console.log('[CONFIG] GLPI_PETA:', window.APP_CONFIG.GLPI_PETA_URL ? 'URL configurada' : 'URL não configurada');
console.log('[CONFIG] GLPI_GMX:', window.APP_CONFIG.GLPI_GMX_URL ? 'URL configurada' : 'URL não configurada');