import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  // Caminhos absolutos para o content funcionar mesmo quando o dev server
  // é iniciado de outro diretório (ex.: pelo preview).
  content: [resolve(raiz, 'index.html'), resolve(raiz, 'src/**/*.{js,jsx}')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Identidade visual do protótipo Financia+
        blue: { DEFAULT: '#185FA5', soft: '#E8F0F8', hover: '#14528f' },
        navy: '#0A1628',
        bg: '#F7F9FC',
        border: '#E2E8F0',
        muted: { DEFAULT: '#64748B', 2: '#94A3B8' },
        green: { DEFAULT: '#15803D', soft: '#E7F4EC' },
        amber: { DEFAULT: '#B45309', soft: '#FBF1E3' },
        red: { DEFAULT: '#B91C1C', soft: '#FBEAEA' },
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(10,22,40,.04), 0 1px 12px rgba(10,22,40,.03)',
      },
    },
  },
  plugins: [],
};
