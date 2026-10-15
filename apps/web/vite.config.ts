import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// The gateway (apps/gateway) owns /api and /v1. In dev, Vite proxies both so
// the browser talks to one origin and the JWT never crosses origins.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gateway = env.GATEWAY_URL || 'http://localhost:8080'

  // The gateway accepts one browser Origin (CORS_ORIGIN, default
  // http://localhost:5173) and answers 403 to any other, so a console on 5174
  // could never sign in. Requests from this dev server's own page are
  // same-origin, so drop their Origin; requests from any other site keep it and
  // the gateway still refuses them.
  const toGateway: ProxyOptions = {
    target: gateway,
    changeOrigin: true,
    configure: (proxy) =>
      proxy.on('proxyReq', (proxyReq, req) => {
        const origin = req.headers.origin
        if (!origin || !req.headers.host) return
        try {
          if (new URL(origin).host === req.headers.host) proxyReq.removeHeader('origin')
        } catch {
          // An opaque Origin such as "null" is left for the gateway to refuse.
        }
      }),
  }

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
        '/api': toGateway,
        '/v1': toGateway,
      },
    },
  }
})
