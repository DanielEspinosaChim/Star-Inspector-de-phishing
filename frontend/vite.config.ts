import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// El frontend llama a /api y Vite lo reenvía al gateway agregando la API key.
// GATEWAY_API_KEY no lleva prefijo VITE_, así que nunca se incluye en el bundle.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.GATEWAY_URL || 'http://localhost:3000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          headers: { 'x-api-key': env.GATEWAY_API_KEY ?? '' },
        },
      },
    },
  }
})
