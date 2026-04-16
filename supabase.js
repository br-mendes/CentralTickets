// supabase.js - Inicialização do Supabase com tratamento de erros
import { createClient } from '@supabase/supabase-js';
import config from './config.js';

let supabaseClient;

try {
  // Validar URL e chave antes de inicializar
  if (!config.supabase.url || !config.supabase.anonKey) {
    throw new Error('Configuração do Supabase inválida: URL ou chave faltando');
  }

  supabaseClient = createClient(config.supabase.url, config.supabase.anonKey);
  
  // Adicionar interceptador de erros
  supabaseClient.onError((error) => {
    console.error('❌ Erro no Supabase:', error.message);
    // Exibir mensagem amigável para o usuário
    alert(`Erro de conexão: ${error.message}. Verifique sua conexão e tente novamente.`);
  });

  console.log('✅ Supabase inicializado com sucesso');
} catch (error) {
  console.error('❌ Falha ao inicializar Supabase:', error.message);
  throw error; // Propagar erro para tratamento superior
}

// Função para obter cliente
function getSupabaseClient() {
  if (!supabaseClient) {
    throw new Error('Supabase não inicializado. Verifique a configuração.');
  }
  return supabaseClient;
}

export { getSupabaseClient };