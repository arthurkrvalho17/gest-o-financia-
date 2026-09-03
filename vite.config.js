import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const raiz = dirname(fileURLToPath(import.meta.url));

// PostCSS configurado aqui (e não só no postcss.config.js) para que o
// Tailwind funcione mesmo quando o dev server é iniciado de outro diretório.
// O config do Tailwind é apontado por caminho absoluto pelo mesmo motivo.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // As Edge Functions (Deno) importam a lib por URL — o Deno resolve isso
    // sozinho em produção. Este alias só existe para o Vite/Vitest conseguir
    // importar esses arquivos nos testes (unit-test dos guards de emitir()/
    // processar()), usando a MESMA lib já instalada como dependência normal.
    alias: {
      'https://esm.sh/@supabase/supabase-js@2': '@supabase/supabase-js',
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: resolve(raiz, 'tailwind.config.js') }),
        autoprefixer,
      ],
    },
  },
});
