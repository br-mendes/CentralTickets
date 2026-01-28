/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    GLPI_PETA_URL: process.env.GLPI_PETA_URL,
    GLPI_PETA_API_URL: process.env.GLPI_PETA_API_URL,
    GLPI_PETA_APP_TOKEN: process.env.GLPI_PETA_APP_TOKEN,
    GLPI_PETA_USER_TOKEN: process.env.GLPI_PETA_USER_TOKEN,
    GLPI_PETA_USER: process.env.GLPI_PETA_USER,
    GLPI_PETA_USERNAME: process.env.GLPI_PETA_USERNAME,
    GLPI_PETA_PASSWORD: process.env.GLPI_PETA_PASSWORD,
    GLPI_GMX_URL: process.env.GLPI_GMX_URL,
    GLPI_GMX_API_URL: process.env.GLPI_GMX_API_URL,
    GLPI_GMX_APP_TOKEN: process.env.GLPI_GMX_APP_TOKEN,
    GLPI_GMX_USER_TOKEN: process.env.GLPI_GMX_USER_TOKEN,
    GLPI_GMX_USER: process.env.GLPI_GMX_USER,
    GLPI_GMX_USERNAME: process.env.GLPI_GMX_USERNAME,
    GLPI_GMX_PASSWORD: process.env.GLPI_GMX_PASSWORD,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  }
};

module.exports = nextConfig;