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

// Load config from API or window
(async function initConfig() {
    // First check window.APP_CONFIG (from config.local.js)
    if (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) {
        window.APP_CONFIG.SUPABASE_URL = normalizeUrl(window.APP_CONFIG.SUPABASE_URL);
        logConfig();
        return;
    }
    
    // Try to fetch from /api/config (Vercel serverless)
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const apiConfig = await response.json();
            window.APP_CONFIG = { ...window.APP_CONFIG, ...apiConfig };
            window.APP_CONFIG.SUPABASE_URL = normalizeUrl(window.APP_CONFIG.SUPABASE_URL);
            if (window.initApp) window.initApp();
            return;
        }
    } catch (e) {
        console.log('[CONFIG] API fetch failed, trying window vars');
    }
    
    // Try window variables directly
    const vars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'GLPI_PETA_URL', 'GLPI_PETA_USER_TOKEN', 'GLPI_PETA_APP_TOKEN', 'GLPI_GMX_URL', 'GLPI_GMX_USER_TOKEN', 'GLPI_GMX_APP_TOKEN'];
    const found = vars.some(k => window[k]);
    
    if (found) {
        window.APP_CONFIG = window.APP_CONFIG || {};
        for (const key of vars) {
            if (window[key]) window.APP_CONFIG[key] = window[key];
        }
        window.APP_CONFIG.SUPABASE_URL = normalizeUrl(window.APP_CONFIG.SUPABASE_URL);
    }
    
    logConfig();
})();

function logConfig() {
    const isConfigured = window.APP_CONFIG?.SUPABASE_URL && window.APP_CONFIG?.GLPI_PETA_URL;
    console.log('[CONFIG] Status:', isConfigured ? 'OK' : 'FALTANDO credenciais');
    console.log('[CONFIG] SUPABASE_URL:', window.APP_CONFIG?.SUPABASE_URL ? 'OK' : 'FALTANDO');
    console.log('[CONFIG] GLPI_PETA_URL:', window.APP_CONFIG?.GLPI_PETA_URL || 'não configurado');
    console.log('[CONFIG] GLPI_GMX_URL:', window.APP_CONFIG?.GLPI_GMX_URL || 'não configurado');
}
console.log('[CONFIG] SUPABASE_URL:', window.APP_CONFIG?.SUPABASE_URL ? 'OK' : 'FALTANDO');
console.log('[CONFIG] GLPI_PETA_URL:', window.APP_CONFIG?.GLPI_PETA_URL || 'não configurado');
console.log('[CONFIG] GLPI_GMX_URL:', window.APP_CONFIG?.GLPI_GMX_URL || 'não configurado');