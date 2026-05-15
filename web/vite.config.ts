import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, new URL('..', import.meta.url).pathname, '');
  const apiPort = process.env.API_PORT ?? env.PORT ?? '3000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': `http://localhost:${apiPort}`,
        '/healthz': `http://localhost:${apiPort}`,
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
      globals: false,
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
