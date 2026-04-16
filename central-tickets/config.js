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

window.APP_CONFIG = window.APP_CONFIG || window.APP_CONFIG_WITH_LOCAL || {
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

const isConfigured = window.APP_CONFIG?.SUPABASE_URL && window.APP_CONFIG?.GLPI_PETA_URL;
console.log('[CONFIG] Status:', isConfigured ? 'Configurado' : 'FALTANDO credenciais');
console.log('[CONFIG] SUPABASE_URL:', window.APP_CONFIG?.SUPABASE_URL ? 'OK' : 'FALTANDO');
console.log('[CONFIG] GLPI_PETA_URL:', window.APP_CONFIG?.GLPI_PETA_URL || 'não configurado');
console.log('[CONFIG] GLPI_GMX_URL:', window.APP_CONFIG?.GLPI_GMX_URL || 'não configurado');