import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    proxy: {
      '/api/auth-proxy': {
        target: 'https://login.microsoftonline.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth-proxy/, ''),
        secure: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            // Remove the Origin header so Azure thinks this is a backend server
            proxyReq.removeHeader('Origin');
          });
        },
      },
      '/api/ai-proxy': {
        target: 'https://frcorregidorprompts.services.ai.azure.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai-proxy/, ''),
        secure: true,
      },
      '/api/backend-proxy': {
        target: 'https://registrohorasback.azurewebsites.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/backend-proxy/, ''),
        secure: true,
      }
    }
  }
})
