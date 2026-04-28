/**
 * Vercel API endpoint to inject environment variables
 * This runs server-side and has access to process.env
 */

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 'no-store');
    
    const config = {
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
        GLPI_PETA_URL: process.env.PETA_BASE_URL || '',
        GLPI_PETA_USER_TOKEN: process.env.PETA_USER_TOKEN || '',
        GLPI_PETA_APP_TOKEN: process.env.PETA_APP_TOKEN || '',
        GLPI_GMX_URL: process.env.GMX_BASE_URL || '',
        GLPI_GMX_USER_TOKEN: process.env.GMX_USER_TOKEN || '',
        GLPI_GMX_APP_TOKEN: process.env.GMX_APP_TOKEN || '',
        GLPI_PETA_TICKET_URL: 'https://glpi.petacorp.com.br/front/ticket.form.php?id=',
        GLPI_GMX_TICKET_URL: 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id='
    };
    
    // Check for missing required vars
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
        return res.status(500).json({ 
            error: 'Configuração incompleta',
            missing: !config.SUPABASE_URL ? ['SUPABASE_URL'] : ['SUPABASE_ANON_KEY']
        });
    }
    
    res.status(200).json(config);
};
