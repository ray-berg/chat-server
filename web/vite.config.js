import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy targets the live chat-server API (self-signed TLS, so secure:false).
// Override with CHAT_API_TARGET when running against a different backend.
const BACKEND = process.env.CHAT_API_TARGET || 'https://chat.ttw.internal:4433';
const WS_BACKEND = BACKEND.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true, secure: false },
      '/health': { target: BACKEND, changeOrigin: true, secure: false },
      '/uploads': { target: BACKEND, changeOrigin: true, secure: false },
      '/ws': { target: WS_BACKEND, ws: true, changeOrigin: true, secure: false },
    },
  },
});
