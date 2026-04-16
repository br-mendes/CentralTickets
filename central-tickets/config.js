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

// Immediate config load (synchronous)
(function() {
    // Already have config?
    if (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) {
        window.APP_CONFIG.SUPABASE_URL = normalizeUrl(window.APP_CONFIG.SUPABASE_URL);
        console.log('[CONFIG] OK (from pre-filled)');
        return;
    }
    
    // Map NEXT_PUBLIC_* to APP_CONFIG - these are immediately available in browser
    const urlMap = {
        'NEXT_PUBLIC_SUPABASE_URL': 'SUPABASE_URL',
        'NEXT_PUBLIC_GLPI_PETA_URL': 'GLPI_PETA_URL',
        'NEXT_PUBLIC_GLPI_GMX_URL': 'GLPI_GMX_URL',
        'NEXT_PUBLIC_GLPI_PETA': 'GLPI_PETA_TICKET_URL',
        'NEXT_PUBLIC_GLPI_GMX': 'GLPI_GMX_TICKET_URL',
    };
    
    for (const [envKey, configKey] of Object.entries(urlMap)) {
        if (window[envKey]) {
            window.APP_CONFIG = window.APP_CONFIG || {};
            window.APP_CONFIG[configKey] = window[envKey];
        }
    }
    
    // Token map
    const tokenMap = {
        'SUPABASE_ANON_KEY': 'SUPABASE_ANON_KEY',
        'PETA_USER_TOKEN': 'GLPI_PETA_USER_TOKEN',
        'PETA_APP_TOKEN': 'GLPI_PETA_APP_TOKEN',
        'GMX_USER_TOKEN': 'GLPI_GMX_USER_TOKEN',
        'GMX_APP_TOKEN': 'GLPI_GMX_APP_TOKEN',
    };
    
    for (const [envKey, configKey] of Object.entries(tokenMap)) {
        if (window[envKey]) {
            window.APP_CONFIG = window.APP_CONFIG || {};
            window.APP_CONFIG[configKey] = window[envKey];
        }
    }
    
    // Normalize
    if (window.APP_CONFIG?.SUPABASE_URL) {
        window.APP_CONFIG.SUPABASE_URL = normalizeUrl(window.APP_CONFIG.SUPABASE_URL);
    }
    
    const isConfigured = window.APP_CONFIG?.SUPABASE_URL && window.APP_CONFIG?.GLPI_PETA_URL;
    console.log('[CONFIG] Status:', isConfigured ? 'OK' : 'FALTANDO');
    console.log('[CONFIG] SUPABASE_URL:', isConfigured ? 'OK' : 'FALTANDO');
    console.log('[CONFIG] GLPI_PETA_URL:', window.APP_CONFIG?.GLPI_PETA_URL || 'não configurado');
    console.log('[CONFIG] GLPI_GMX_URL:', window.APP_CONFIG?.GLPI_GMX_URL || 'não configurado');
})();