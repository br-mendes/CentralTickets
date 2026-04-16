/**
 * Generates config-generated.js at Vercel build time.
 * All env vars from the Vercel dashboard are available via process.env here.
 */
console.log('[BUILD-START] Running generate-config.js');
const fs = require('fs');
const path = require('path');

const normalizeUrl = (url) => {
    if (!url) return '';
    return url.replace(/\/auth\/v1(\/.*)?$/, '').replace(/\/$/, '');
};

const config = {
    SUPABASE_URL: normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''),
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    GLPI_PETA_URL: process.env.NEXT_PUBLIC_GLPI_PETA_URL || process.env.GLPI_PETA_URL || '',
    GLPI_PETA_USER_TOKEN: process.env.PETA_USER_TOKEN || process.env.GLPI_PETA_USER_TOKEN || '',
    GLPI_PETA_APP_TOKEN: process.env.PETA_APP_TOKEN || process.env.GLPI_PETA_APP_TOKEN || '',
    GLPI_GMX_URL: process.env.NEXT_PUBLIC_GLPI_GMX_URL || process.env.GLPI_GMX_URL || '',
    GLPI_GMX_USER_TOKEN: process.env.GMX_USER_TOKEN || process.env.GLPI_GMX_USER_TOKEN || '',
    GLPI_GMX_APP_TOKEN: process.env.GMX_APP_TOKEN || process.env.GMX_APP_TOKEN || '',
    GLPI_PETA_TICKET_URL: process.env.NEXT_PUBLIC_GLPI_PETA || 'https://glpi.petacorp.com.br/front/ticket.form.php?id=',
    GLPI_GMX_TICKET_URL: process.env.NEXT_PUBLIC_GLPI_GMX || 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id=',
};

console.log('[BUILD] Env vars check:');
console.log('[BUILD]   NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'UNSET');
console.log('[BUILD]   SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'UNSET');
console.log('[BUILD]   SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'UNSET');
console.log('[BUILD]   NEXT_PUBLIC_GLPI_PETA_URL:', process.env.NEXT_PUBLIC_GLPI_PETA_URL ? 'SET' : 'UNSET');
console.log('[BUILD]   PETA_USER_TOKEN:', process.env.PETA_USER_TOKEN ? 'SET' : 'UNSET');
console.log('[BUILD]   PETA_APP_TOKEN:', process.env.PETA_APP_TOKEN ? 'SET' : 'UNSET');
console.log('[BUILD]   NEXT_PUBLIC_GLPI_GMX_URL:', process.env.NEXT_PUBLIC_GLPI_GMX_URL ? 'SET' : 'UNSET');
console.log('[BUILD]   GMX_USER_TOKEN:', process.env.GMX_USER_TOKEN ? 'SET' : 'UNSET');
console.log('[BUILD]   GMX_APP_TOKEN:', process.env.GMX_APP_TOKEN ? 'SET' : 'UNSET');
console.log('[BUILD]   NEXT_PUBLIC_GLPI_PETA:', process.env.NEXT_PUBLIC_GLPI_PETA ? 'SET' : 'UNSET');
console.log('[BUILD]   NEXT_PUBLIC_GLPI_GMX:', process.env.NEXT_PUBLIC_GLPI_GMX ? 'SET' : 'UNSET');

const content = `// Auto-generated at Vercel build time — do not edit manually
window.APP_CONFIG = ${JSON.stringify(config, null, 2)};
console.log('[CONFIG-GENERATED] Loaded:', window.APP_CONFIG.SUPABASE_URL ? 'OK' : 'MISSING');
`;

const outPath = path.join(__dirname, '..', 'config-generated.js');
fs.writeFileSync(outPath, content);

const status = Object.entries(config).map(([k, v]) => `${k}=${v ? 'OK' : 'MISSING'}`).join(', ');
console.log('[BUILD] config-generated.js written to:', outPath);
console.log('[BUILD] Config status:', status);

// Verify critical vars
if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    console.error('[BUILD] ERROR: Missing critical env vars!');
    console.error('[BUILD] Check Vercel Environment Variables:');
    console.error('[BUILD] - NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
    console.error('[BUILD] - SUPABASE_ANON_KEY');
    process.exit(1);
}

console.log('[BUILD-END] generate-config.js completed successfully');

// Verify critical vars
if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    console.error('[BUILD] ERROR: Missing critical env vars!');
    console.error('[BUILD] Check Vercel Environment Variables:');
    console.error('[BUILD] - NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
    console.error('[BUILD] - SUPABASE_ANON_KEY');
    process.exit(1);
}
