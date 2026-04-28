/**
 * Vercel Serverless Function to inject environment variables
 * Deploy this to /api/env.js
 */

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/javascript');
    
    const config = `window.APP_CONFIG = {
    SUPABASE_URL: '${process.env.SUPABASE_URL || ''}',
    SUPABASE_ANON_KEY: '${process.env.SUPABASE_ANON_KEY || ''}',
    GLPI_PETA_URL: '${process.env.GLPI_PETA_URL || ''}',
    GLPI_PETA_USER_TOKEN: '${process.env.GLPI_PETA_USER_TOKEN || ''}',
    GLPI_PETA_APP_TOKEN: '${process.env.GLPI_PETA_APP_TOKEN || ''}',
    GLPI_GMX_URL: '${process.env.GLPI_GMX_URL || ''}',
    GLPI_GMX_USER_TOKEN: '${process.env.GLPI_GMX_USER_TOKEN || ''}',
    GLPI_GMX_APP_TOKEN: '${process.env.GLPI_GMX_APP_TOKEN || ''}',
    GLPI_PETA_TICKET_URL: 'https://glpi.petacorp.com.br/front/ticket.form.php?id=',
    GLPI_GMX_TICKET_URL: 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id='
};`;
    
    res.setHeader('Cache-Control', 'no-store');
    res.send(config);
};
