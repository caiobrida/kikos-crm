import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// O `.env` fica na raiz do monorepo, um arquivo só para docker compose, API e web.
const envDir = new URL('../../', import.meta.url).pathname;

export default defineConfig(({ mode }) => {
  // O terceiro argumento vazio carrega todas as variáveis, não só as `VITE_*`.
  // Elas ficam neste arquivo de configuração e não vazam para o bundle.
  const env = loadEnv(mode, envDir, '');
  const apiPort = Number(env['API_PORT']) || 3333;
  const webPort = Number(env['WEB_PORT']) || 5173;

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: {
      port: webPort,
      proxy: {
        /*
         * Tudo same-origin em desenvolvimento: o navegador fala só com o Vite,
         * e o Vite repassa `/api/*` para a API. É o que faz os cookies
         * `httpOnly` de sessão funcionarem sem CORS nem `SameSite=None`
         * (ver ADR-0004).
         *
         * O prefixo `/api` é convenção do proxy, não da API: o contrato HTTP
         * do servidor é `/health`, `/auth/login`, `/leads`… sem prefixo.
         */
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
