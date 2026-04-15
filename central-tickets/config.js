/**
 * Configuração Central de Tickets
 * 
 * Para Vercel: Configure as Environment Variables em:
 * Project Settings > Environment Variables
 * 
 * Variáveis necessárias:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - GLPI_PETA_URL
 * - GLPI_PETA_USER_TOKEN
 * - GLPI_PETA_APP_TOKEN
 * - GLPI_GMX_URL
 * - GLPI_GMX_USER_TOKEN
 * - GLPI_GMX_APP_TOKEN
 * - GLPI_PETA_TICKET_URL
 * - GLPI_GMX_TICKET_URL
 */

// Check if APP_CONFIG is already set (by Vercel env vars)
if (typeof window.APP_CONFIG === 'undefined') {
    window.APP_CONFIG = {};
}

// Validate required config
const requiredVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = requiredVars.filter(key => !window.APP_CONFIG[key]);

if (missing.length > 0) {
    console.error('[CONFIG] ERRO: Variáveis de ambiente faltando:', missing.join(', '));
    console.error('[CONFIG] Configure no Vercel Dashboard > Environment Variables');
    throw new Error('Configuração incompleta. Verifique as variáveis de ambiente.');
}

// Ticket URLs
window.APP_CONFIG.GLPI_PETA_TICKET_URL = window.APP_CONFIG.GLPI_PETA_TICKET_URL || 'https://glpi.petacorp.com.br/front/ticket.form.php?id=';
window.APP_CONFIG.GLPI_GMX_TICKET_URL = window.APP_CONFIG.GLPI_GMX_TICKET_URL || 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id=';

console.log('[CONFIG] Configuração carregada com sucesso');