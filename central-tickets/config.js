// Configurações carregadas de variáveis de ambiente
// Essas variáveis são injetadas pela Vercel

window.API_CONFIG = {
    PETA_BASE_URL: window.env?.PETA_BASE_URL || '',
    PETA_USER_TOKEN: window.env?.PETA_USER_TOKEN || '',
    PETA_APP_TOKEN: window.env?.PETA_APP_TOKEN || '',
    GMX_BASE_URL: window.env?.GMX_BASE_URL || '',
    GMX_USER_TOKEN: window.env?.GMX_USER_TOKEN || '',
    GMX_APP_TOKEN: window.env?.GMX_APP_TOKEN || ''
};

window.INSTANCES = {
    'Peta': {
        BASE_URL: window.API_CONFIG.PETA_BASE_URL,
        USER_TOKEN: window.API_CONFIG.PETA_USER_TOKEN,
        APP_TOKEN: window.API_CONFIG.PETA_APP_TOKEN,
        TICKET_URL: window.API_CONFIG.PETA_BASE_URL.replace('/apirest.php', '/front/ticket.form.php?id=')
    },
    'GMX': {
        BASE_URL: window.API_CONFIG.GMX_BASE_URL,
        USER_TOKEN: window.API_CONFIG.GMX_USER_TOKEN,
        APP_TOKEN: window.API_CONFIG.GMX_APP_TOKEN,
        TICKET_URL: window.API_CONFIG.GMX_BASE_URL.replace('/apirest.php', '/front/ticket.form.php?id=')
    }
};
