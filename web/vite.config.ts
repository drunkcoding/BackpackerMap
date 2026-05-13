import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT ?? 3000}`,
      '/healthz': `http://localhost:${process.env.API_PORT ?? 3000}`,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
  },
});
