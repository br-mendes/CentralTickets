/**
 * HARD FIX: Inject config directly into ALL HTML files at build time.
 * No external files, no caching issues. Config is baked into HTML.
 */
console.log('[BUILD] Starting hard fix config injection...');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

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
    GLPI_GMX_APP_TOKEN: process.env.GMX_APP_TOKEN || process.env.GLPI_GMX_APP_TOKEN || '',
    GLPI_PETA_TICKET_URL: process.env.NEXT_PUBLIC_GLPI_PETA || 'https://glpi.petacorp.com.br/front/ticket.form.php?id=',
    GLPI_GMX_TICKET_URL: process.env.NEXT_PUBLIC_GLPI_GMX || 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id=',
};

// Inline config script - NO EXTERNAL FILE NEEDED
const inlineConfig = `<script>
window.APP_CONFIG = ${JSON.stringify(config)};
console.log('[CONFIG] Loaded from build-time injection');
</script>`;

// Find all HTML files
const htmlFiles = fs.readdirSync(rootDir)
    .filter(f => f.endsWith('.html'));

console.log('[BUILD] Found HTML files:', htmlFiles.join(', '));

let processed = 0;
let errors = 0;

for (const file of htmlFiles) {
    const filePath = path.join(rootDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace config-generated.js and config.js with inline config
    content = content.replace(/<script src="[\/]?config-generated\.js"><\/script>/gi, '');
    content = content.replace(/<script src="[\/]?config\.js"><\/script>/gi, '');
    
    // Remove any existing window.APP_CONFIG definitions
    content = content.replace(/<script>[\s\S]*?window\.APP_CONFIG\s*=[\s\S]*?;[\s\S]*?<\/script>/gi, '');
    
    // Inject inline config right after <head> tag
    if (content.includes('<head>')) {
        content = content.replace('<head>', '<head>\n' + inlineConfig);
    } else if (content.includes('<html')) {
        content = content.replace(/<html[^>]*>/, '$&\n<head>\n' + inlineConfig + '\n</head>');
    }
    
    fs.writeFileSync(filePath, content);
    console.log('[BUILD] Processed:', file);
    processed++;
}

console.log('[BUILD] ========================');
console.log('[BUILD] DONE! Processed', processed, 'files');
console.log('[BUILD] Config injected:');
console.log('[BUILD]   SUPABASE_URL:', config.SUPABASE_URL ? 'OK' : 'MISSING');
console.log('[BUILD]   SUPABASE_ANON_KEY:', config.SUPABASE_ANON_KEY ? 'OK' : 'MISSING');
console.log('[BUILD]   GLPI_PETA_URL:', config.GLPI_PETA_URL ? 'OK' : 'MISSING');
console.log('[BUILD]   GLPI_GMX_URL:', config.GLPI_GMX_URL ? 'OK' : 'MISSING');
console.log('[BUILD] ========================');

if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    console.error('[BUILD] ERROR: Missing critical env vars!');
    process.exit(1);
}
