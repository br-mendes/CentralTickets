const fs = require('fs');
const path = require('path');

const envTemplate = `// Configurações carregadas de variáveis de ambiente (injetadas pela Vercel)

window.env = {
    PETA_BASE_URL: '{{PETA_BASE_URL}}',
    PETA_USER_TOKEN: '{{PETA_USER_TOKEN}}',
    PETA_APP_TOKEN: '{{PETA_APP_TOKEN}}',
    GMX_BASE_URL: '{{GMX_BASE_URL}}',
    GMX_USER_TOKEN: '{{GMX_USER_TOKEN}}',
    GMX_APP_TOKEN: '{{GMX_APP_TOKEN}}'
};

window.INSTANCES = {
    'Peta': {
        BASE_URL: window.env.PETA_BASE_URL,
        USER_TOKEN: window.env.PETA_USER_TOKEN,
        APP_TOKEN: window.env.PETA_APP_TOKEN,
        TICKET_URL: window.env.PETA_BASE_URL ? window.env.PETA_BASE_URL.replace('/apirest.php', '/front/ticket.form.php?id=') : ''
    },
    'GMX': {
        BASE_URL: window.env.GMX_BASE_URL,
        USER_TOKEN: window.env.GMX_USER_TOKEN,
        APP_TOKEN: window.env.GMX_APP_TOKEN,
        TICKET_URL: window.env.GMX_BASE_URL ? window.env.GMX_BASE_URL.replace('/apirest.php', '/front/ticket.form.php?id=') : ''
    }
};
`;

const configContent = envTemplate
    .replace('{{PETA_BASE_URL}}', process.env.PETA_BASE_URL || '')
    .replace('{{PETA_USER_TOKEN}}', process.env.PETA_USER_TOKEN || '')
    .replace('{{PETA_APP_TOKEN}}', process.env.PETA_APP_TOKEN || '')
    .replace('{{GMX_BASE_URL}}', process.env.GMX_BASE_URL || '')
    .replace('{{GMX_USER_TOKEN}}', process.env.GMX_USER_TOKEN || '')
    .replace('{{GMX_APP_TOKEN}}', process.env.GMX_APP_TOKEN || '');

fs.writeFileSync(path.join(__dirname, 'config.js'), configContent);
console.log('config.js gerado com sucesso!');
