import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Aviso claro em dev se as chaves não estiverem configuradas.
export const supabaseConfigurado = Boolean(url && anonKey);

if (!supabaseConfigurado) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Financia+] Supabase não configurado. Preencha VITE_SUPABASE_URL e ' +
      'VITE_SUPABASE_ANON_KEY no arquivo .env.local e reinicie o "npm run dev".'
  );
}

// Cria o cliente mesmo sem chaves (com placeholders) para o app não quebrar
// na importação; as telas mostram o aviso de configuração quando necessário.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key'
);
