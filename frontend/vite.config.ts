import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'CAREEROS_');
  return {
    cacheDir: env.CAREEROS_VITE_CACHE_DIR || 'node_modules/.vite',
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173, strictPort: true,
      proxy: { '/api': { target: env.CAREEROS_API_PROXY_TARGET || 'http://127.0.0.1:3000' } },
    },
  };
});
