import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { spawn, type ChildProcess } from 'node:child_process'

// Dev-only Endpoint für den "Kurse aktualisieren"-Button: startet fetch-prices.mjs
// als Kindprozess und lässt das Frontend den Fortschritt pollen. Existiert nur im
// Vite-Dev-Server (configureServer), landet nicht im Produktions-Build.
function fetchApiPlugin(): Plugin {
  let child: ChildProcess | null = null
  let log = ''
  let exitCode: number | null = null
  let startedAt: number | null = null
  let finishedAt: number | null = null
  const MAX_LOG = 8000

  function append(chunk: Buffer) {
    log = (log + chunk.toString()).slice(-MAX_LOG)
  }

  return {
    name: 'fetch-prices-api',
    configureServer(server) {
      server.middlewares.use('/api/refresh', (req, res) => {
        if (req.method === 'POST') {
          if (child) {
            res.statusCode = 409
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'already running' }))
            return
          }
          log = ''
          exitCode = null
          startedAt = Date.now()
          finishedAt = null
          child = spawn(process.execPath, ['scripts/fetch-prices.mjs'], { cwd: server.config.root })
          child.stdout?.on('data', append)
          child.stderr?.on('data', append)
          child.on('close', (code) => {
            exitCode = code
            finishedAt = Date.now()
            child = null
          })
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ started: true }))
          return
        }
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ running: child !== null, log, exitCode, startedAt, finishedAt }))
          return
        }
        res.statusCode = 405
        res.end()
      })
    },
  }
}

// GitHub Pages Project-Site läuft unter /<repo>/, nicht an der Domain-Wurzel.
// Bei Umzug auf Cloudflare Pages (Domain-Wurzel) einfach auf '/' zurücksetzen.
const GITHUB_PAGES_BASE = '/aktien-watchlist/'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? GITHUB_PAGES_BASE : '/',
  plugins: [react(), tailwindcss(), fetchApiPlugin()],
}))
