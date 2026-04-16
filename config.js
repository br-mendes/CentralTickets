// config.js - Configuração centralizada com validação
const isDev = process.env.NODE_ENV !== 'production';

// Validar variáveis obrigatórias
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_GLPI_GMX_URL',
  'NEXT_PUBLIC_GLPI_PETA_URL',
];

const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingVars.length > 0) {
  console.error('❌ Variáveis de ambiente faltando:', missingVars.join(', '));
  throw new Error(`Configuração inválida: Faltam variáveis de ambiente: ${missingVars.join(', ')}`);
}

// Configuração validada
const config = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  glpi: {
    gmxUrl: process.env.NEXT_PUBLIC_GLPI_GMX_URL,
    petaUrl: process.env.NEXT_PUBLIC_GLPI_PETA_URL,
    // Usar tokens se disponíveis, fallback para credenciais
    tokens: {
      petaApp: process.env.PETA_APP_TOKEN,
      petaUser: process.env.PETA_USER_TOKEN,
      gmxApp: process.env.GMX_APP_TOKEN,
      gmxUser: process.env.GMX_USER_TOKEN,
    },
    credentials: {
      user: process.env.GLPI_USER_ADM,
      password: process.env.GLPI_USER_ADM_PASSWORD,
    },
  },
  env: {
    isDev,
    isProduction: !isDev,
  },
};

// Log configuração apenas em desenvolvimento
if (isDev) {
  console.log('[CONFIG] Status: OK');
  console.log('[CONFIG] SUPABASE_URL:', config.supabase.url ? 'OK' : 'FALTANDO');
  console.log('[CONFIG] GLPI_PETA_URL:', config.glpi.petaUrl ? 'OK' : 'FALTANDO');
  console.log('[CONFIG] GLPI_GMX_URL:', config.glpi.gmxUrl ? 'OK' : 'FALTANDO');
}

export default config;