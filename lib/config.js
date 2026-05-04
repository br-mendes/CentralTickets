// lib/config.js - Configuração centralizada
const config = {
  // Supabase
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },

  // GLPI
  glpi: {
    gmxUrl: process.env.NEXT_PUBLIC_GLPI_GMX_URL,
    petaUrl: process.env.NEXT_PUBLIC_GLPI_PETA_URL,
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

  // Validação de configuração
  validate() {
    const required = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_GLPI_GMX_URL',
      'NEXT_PUBLIC_GLPI_PETA_URL',
    ]

    const missing = required.filter(env => !process.env[env])
    if (missing.length > 0) {
      throw new Error(`Configuração inválida: Faltam variáveis: ${missing.join(', ')}`)
    }
  },
}

// Validação apenas quando explicitamente chamada (não no carregamento)

export default config