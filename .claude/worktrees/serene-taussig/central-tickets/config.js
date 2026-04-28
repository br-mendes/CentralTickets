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

window.APP_CONFIG = window.APP_CONFIG || {
    SUPABASE_URL: 'https://zyigzxkwnltudojumhpq.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5aWd6eGt3bmx0dWRvanVtaHBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MzM5MTEsImV4cCI6MjA4NTEwOTkxMX0.jXi-9YraRsebeuiDQzWpRHzbqZc4qdTC_J1u6K_bjwk',
    
    GLPI_PETA_URL: 'https://glpi.petacorp.com.br/apirest.php',
    GLPI_PETA_USER_TOKEN: 'PveUan5K0TcmshIlTOmB3x9QqGON2AGwI7AXTwOS',
    GLPI_PETA_APP_TOKEN: 'guhEhrBwOaU1Wk6ETIuWc2jZf3tVkL7VWd62oz51',
    
    GLPI_GMX_URL: 'https://glpi.gmxtecnologia.com.br/apirest.php',
    GLPI_GMX_USER_TOKEN: 'b8WgBZm1upQDj3BYaKMePRXRSyywM6n8xkytzRph',
    GLPI_GMX_APP_TOKEN: 'whm88xUDeRBEamJi1IeRhRGFmixdIVouoNdCuBpF',
    
    GLPI_PETA_TICKET_URL: 'https://glpi.petacorp.com.br/front/ticket.form.php?id=',
    GLPI_GMX_TICKET_URL: 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id='
};

console.log('[CONFIG] Configurações carregadas');
console.log('[CONFIG] SUPABASE_URL:', window.APP_CONFIG?.SUPABASE_URL ? 'OK' : 'FALTANDO');
console.log('[CONFIG] GLPI_PETA_URL:', window.APP_CONFIG?.GLPI_PETA_URL || 'não configurado');
console.log('[CONFIG] GLPI_GMX_URL:', window.APP_CONFIG?.GLPI_GMX_URL || 'não configurado');