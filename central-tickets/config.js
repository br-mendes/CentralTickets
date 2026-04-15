/**
 * Configuração Central de Tickets
 * 
 * Para Vercel: Configure estas Environment Variables:
 * 
 * SUPABASE_URL = https://your-project.supabase.co
 * SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIs...
 * GLPI_PETA_URL = https://glpi.petacorp.com.br/apirest.php
 * GLPI_PETA_USER_TOKEN = your-token
 * GLPI_PETA_APP_TOKEN = your-token
 * GLPI_GMX_URL = https://glpi.gmxtecnologia.com.br/apirest.php
 * GLPI_GMX_USER_TOKEN = your-token
 * GLPI_GMX_APP_TOKEN = your-token
 */

// Try to get config from process.env (Vercel)
let envConfig = {};

if (typeof process !== 'undefined' && process?.env) {
    envConfig = {
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
        GLPI_PETA_URL: process.env.GLPI_PETA_URL || '',
        GLPI_PETA_USER_TOKEN: process.env.GLPI_PETA_USER_TOKEN || '',
        GLPI_PETA_APP_TOKEN: process.env.GLPI_PETA_APP_TOKEN || '',
        GLPI_GMX_URL: process.env.GLPI_GMX_URL || '',
        GLPI_GMX_USER_TOKEN: process.env.GLPI_GMX_USER_TOKEN || '',
        GLPI_GMX_APP_TOKEN: process.env.GLPI_GMX_APP_TOKEN || ''
    };
}

window.APP_CONFIG = window.APP_CONFIG || envConfig;

// Ticket URLs (public, can be static)
window.APP_CONFIG.GLPI_PETA_TICKET_URL = 'https://glpi.petacorp.com.br/front/ticket.form.php?id=';
window.APP_CONFIG.GLPI_GMX_TICKET_URL = 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id=';

// Validate
const hasSupabase = window.APP_CONFIG?.SUPABASE_URL && window.APP_CONFIG?.SUPABASE_ANON_KEY;

if (!hasSupabase) {
    console.warn('[CONFIG] AVISO: Configuração do Supabase incompleta');
    console.warn('[CONFIG] Defina SUPABASE_URL e SUPABASE_ANON_KEY no Vercel Dashboard');
} else {
    console.log('[CONFIG] Supabase configurado:', window.APP_CONFIG.SUPABASE_URL);
}

console.log('[CONFIG] GLPI_PETA:', window.APP_CONFIG.GLPI_PETA_URL || 'NÃO CONFIGURADO');
console.log('[CONFIG] GLPI_GMX:', window.APP_CONFIG.GLPI_GMX_URL || 'NÃO CONFIGURADO');