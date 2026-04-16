/**
 * Vercel API endpoint to inject environment variables
 * This runs server-side and has access to process.env
 * 
 * Vercel env vars need to match these names:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - GLPI_PETA_URL
 * - GLPI_PETA_USER_TOKEN
 * - GLPI_PETA_APP_TOKEN
 * - GLPI_GMX_URL
 * - GLPI_GMX_USER_TOKEN
 * - GLPI_GMX_APP_TOKEN
 */

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    
    // Map Vercel env vars to config keys
    const config = {
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
        GLPI_PETA_URL: process.env.GLPI_PETA_URL || '',
        GLPI_PETA_USER_TOKEN: process.env.PETA_USER_TOKEN || process.env.GLPI_PETA_USER_TOKEN || '',
        GLPI_PETA_APP_TOKEN: process.env.GLPI_PETA_APP_TOKEN || '',
        GLPI_GMX_URL: process.env.GLPI_GMX_URL || '',
        GLPI_GMX_USER_TOKEN: process.env.GMX_USER_TOKEN || process.env.GLPI_GMX_USER_TOKEN || '',
        GLPI_GMX_APP_TOKEN: process.env.GLPI_GMX_APP_TOKEN || '',
        GLPI_PETA_TICKET_URL: process.env.GLPI_PETA_TICKET_URL || 'https://glpi.petacorp.com.br/front/ticket.form.php?id=',
        GLPI_GMX_TICKET_URL: process.env.GLPI_GMX_TICKET_URL || 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id='
    };
    
    // Debug: log available env vars (remove in production)
    console.log('[API] Available envs:', Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('GLPI') || k.includes('PETA') || k.includes('GMX')));
    
    // Check for missing required vars
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
        return res.status(500).json({ 
            error: 'Configuração incompleta',
            hasSupabaseUrl: !!config.SUPABASE_URL,
            hasSupabaseKey: !!config.SUPABASE_ANON_KEY
        });
    }
    
    res.status(200).json(config);
};

module.exports.options = (req, res) => {
    res.status(204).end();
};
