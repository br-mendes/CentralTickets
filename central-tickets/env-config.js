<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Central de Tickets - ENV Config</title>
</head>
<body>
    <script>
        // Inject environment variables from Vercel
        // These are replaced at build time by Vercel
        window.APP_CONFIG = window.APP_CONFIG || {
            SUPABASE_URL: 'SUPABASE_URL_PLACEHOLDER',
            SUPABASE_ANON_KEY: 'SUPABASE_ANON_KEY_PLACEHOLDER',
            GLPI_PETA_URL: 'GLPI_PETA_URL_PLACEHOLDER',
            GLPI_PETA_USER_TOKEN: 'GLPI_PETA_USER_TOKEN_PLACEHOLDER',
            GLPI_PETA_APP_TOKEN: 'GLPI_PETA_APP_TOKEN_PLACEHOLDER',
            GLPI_GMX_URL: 'GLPI_GMX_URL_PLACEHOLDER',
            GLPI_GMX_USER_TOKEN: 'GLPI_GMX_USER_TOKEN_PLACEHOLDER',
            GLPI_GMX_APP_TOKEN: 'GLPI_GMX_APP_TOKEN_PLACEHOLDER',
            GLPI_PETA_TICKET_URL: 'https://glpi.petacorp.com.br/front/ticket.form.php?id=',
            GLPI_GMX_TICKET_URL: 'https://glpi.gmxtecnologia.com.br/front/ticket.form.php?id='
        };
    </script>
    <!-- Normal scripts will now have access to window.APP_CONFIG -->
</body>
</html>