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

// Carrega do window.APP_CONFIG (setado por env variables no deploy)
// Fallback para desenvolvimento local
window.APP_CONFIG = window.APP_CONFIG || {
    SUPABASE_URL: 'https://zyigzxkwnltudojumhpq.supabase.co',
    SUPABASE_ANON_KEY: '',  // Configure via env var
    GLPI_PETA_URL: '',       // Configure via env var
    GLPI_PETA_USER_TOKEN: '', // Configure via env var
    GLPI_PETA_APP_TOKEN: '',  // Configure via env var
    GLPI_GMX_URL: '',         // Configure via env var
    GLPI_GMX_USER_TOKEN: '',  // Configure via env var
    GLPI_GMX_APP_TOKEN: '',   // Configure via env var
    GLPI_PETA_TICKET_URL: 'https://glpi.petacorp.com.br/front/ticket.form.php?id=',
    GLPI_GMX_TICKET_URL: 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id='
};