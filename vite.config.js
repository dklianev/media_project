import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.PORT || '3001';
  const proxyTarget = env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${apiPort}`;
  const proxyTimeout = Number(env.DEV_PROXY_TIMEOUT_MS || 60 * 60 * 1000);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          timeout: proxyTimeout,
          proxyTimeout,
        },
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true,
          timeout: proxyTimeout,
          proxyTimeout,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
