const config = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  glpi: {
    gmxUrl: process.env.NEXT_PUBLIC_GLPI_GMX_URL,
    petaUrl: process.env.NEXT_PUBLIC_GLPI_PETA_URL,
    tokens: {
      petaApp: process.env.PETA_APP_TOKEN,
      petaUser: process.env.PETA_USER_TOKEN,
      gmxApp: process.env.GMX_APP_TOKEN,
      gmxUser: process.env.GMX_USER_TOKEN,
    },
  },
}

export default config
