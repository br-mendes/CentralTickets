/**
 * Vercel API endpoint to inject environment variables
 * Maps user's Vercel env var names to config keys
 */

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    
    // Map user's Vercel env vars to config keys
    const config = {
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
        GLPI_PETA_URL: process.env.NEXT_PUBLIC_GLPI_PETA_URL || process.env.GLPI_PETA_URL || '',
        GLPI_PETA_USER_TOKEN: process.env.PETA_USER_TOKEN || process.env.NEXT_PUBLIC_PETA_USER_TOKEN || '',
        GLPI_PETA_APP_TOKEN: process.env.PETA_APP_TOKEN || process.env.NEXT_PUBLIC_PETA_APP_TOKEN || '',
        GLPI_GMX_URL: process.env.NEXT_PUBLIC_GLPI_GMX_URL || process.env.GLPI_GMX_URL || '',
        GLPI_GMX_USER_TOKEN: process.env.GMX_USER_TOKEN || process.env.NEXT_PUBLIC_GMX_USER_TOKEN || '',
        GLPI_GMX_APP_TOKEN: process.env.GMX_APP_TOKEN || process.env.NEXT_PUBLIC_GMX_APP_TOKEN || '',
        GLPI_PETA_TICKET_URL: process.env.NEXT_PUBLIC_GLPI_PETA || '',
        GLPI_GMX_TICKET_URL: process.env.NEXT_PUBLIC_GLPI_GMX || ''
    };
    
    // Check for missing required vars
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
        return res.status(500).json({ 
            error: 'Configuração incompleta',
            hasUrl: !!config.SUPABASE_URL,
            hasKey: !!config.SUPABASE_ANON_KEY
        });
    }
    
    res.status(200).json(config);
};

module.exports.options = (req, res) => {
    res.status(204).end();
};
