/**
 * Vercel Serverless Function — returns APP_CONFIG as executable JavaScript.
 * Load as <script src="/api/env.js"> to set window.APP_CONFIG synchronously.
 */

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store');

    const normalizeUrl = (url) => {
        if (!url) return '';
        return url.replace(/\/auth\/v1(\/.*)?$/, '').replace(/\/$/, '');
    };

    const config = {
        SUPABASE_URL: normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''),
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
        GLPI_PETA_URL: process.env.NEXT_PUBLIC_GLPI_PETA_URL || '',
        GLPI_PETA_USER_TOKEN: process.env.PETA_USER_TOKEN || '',
        GLPI_PETA_APP_TOKEN: process.env.PETA_APP_TOKEN || '',
        GLPI_GMX_URL: process.env.NEXT_PUBLIC_GLPI_GMX_URL || '',
        GLPI_GMX_USER_TOKEN: process.env.GMX_USER_TOKEN || '',
        GLPI_GMX_APP_TOKEN: process.env.GMX_APP_TOKEN || '',
        GLPI_PETA_TICKET_URL: process.env.NEXT_PUBLIC_GLPI_PETA || 'https://glpi.petacorp.com.br/front/ticket.form.php?id=',
        GLPI_GMX_TICKET_URL: process.env.NEXT_PUBLIC_GLPI_GMX || 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id=',
    };

    res.end(`window.APP_CONFIG = ${JSON.stringify(config)};`);
};
