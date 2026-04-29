/** @type {import('next').NextConfig} */
const nextConfig = {
  // No Next.js 15+, o App Router é ativado automaticamente
  // Sem necessidade de configuração adicional
  output: 'standalone', // Opcional, para otimização de build
  
  // Ignorar pastas que não devem ser compiladas pelo Next.js
  transpilePackages: [],
  
  // Excluir pasta supabase do build
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Ignore supabase functions during client build
      config.externals = [...(config.externals || []), 'supabase']
    }
    return config
  },
  
  // Adicionar pastas a serem ignoradas
  ignoreBuildErrors: ['supabase'],
}

module.exports = nextConfig