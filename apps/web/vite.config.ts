import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// The gateway (apps/gateway) owns /api and /v1. In dev, Vite proxies both so
// the browser talks to one origin and the JWT never crosses origins.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gateway = env.GATEWAY_URL || 'http://localhost:8080'

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // eval/ and results/ sit outside this app's root, so Vite does not watch
        // them by default; without this, new reports only show after a restart.
        name: 'watch-eval-and-results',
        configureServer(server) {
          server.watcher.add([
            fileURLToPath(new URL('../../eval', import.meta.url)),
            fileURLToPath(new URL('../../results', import.meta.url)),
          ])
        },
      },
    ],
    server: {
      port: 5173,
      // The Eval view reads eval/*.jsonl, eval/checks.mjs and results/*.json from the repo root.
      fs: { allow: ['../..'] },
      proxy: {
        '/api': { target: gateway, changeOrigin: true },
        '/v1': { target: gateway, changeOrigin: true },
      },
    },
  }
})
