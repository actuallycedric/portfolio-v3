import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { generate } from './scripts/leetcode/build.mjs'

// Vercel runs api/*.js as functions in production; the vite dev server
// doesn't, so this routes /api/spotify to the same handler during `npm run dev`.
function devApi() {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/spotify', async (_req, res) => {
        const { GET } = await server.ssrLoadModule('/api/spotify.js')
        const response = await GET()
        res.statusCode = response.status
        res.setHeader('Content-Type', 'application/json')
        res.end(await response.text())
      })
    },
  }
}

// /leetcode pages are generated from data/ + content/leetcode/ into leetcode/
// (see scripts/leetcode/build.mjs). The build fails on any validation error;
// the dev server shows the error in the overlay and regenerates on save.
function leetcodePages() {
  const root = fileURLToPath(new URL('.', import.meta.url))
  // pages live at /leetcode/<slug>/index.html; send /leetcode/<slug> there too
  // (vercel resolves this on its own, vite's servers would fall back to /)
  const addSlash = (req, res, next) => {
    const [path, query = ''] = req.url.split('?')
    if (!/^\/leetcode(\/[a-z0-9-]+)?$/.test(path)) return next()
    res.statusCode = 308
    res.setHeader('Location', `${path}/${query && `?${query}`}`)
    res.end()
  }
  return {
    name: 'leetcode-pages',
    async config(_, { command }) {
      if (command !== 'build') {
        await generate().catch((err) => console.error(`\n${err.message}\n`))
        return
      }
      const pages = await generate()
      const input = { main: resolve(root, 'index.html') }
      for (const file of pages) input[relative(root, file).replace(/\/index\.html$/, '')] = file
      return { build: { rolldownOptions: { input } } }
    },
    configurePreviewServer(server) {
      server.middlewares.use(addSlash)
    },
    configureServer(server) {
      server.middlewares.use(addSlash)
      const watched = [resolve(root, 'content/leetcode'), resolve(root, 'data')]
      server.watcher.add(watched)
      let timer
      const regenerate = (file) => {
        if (!watched.some((dir) => file.startsWith(dir))) return
        clearTimeout(timer)
        timer = setTimeout(async () => {
          try {
            await generate()
            server.ws.send({ type: 'full-reload' })
          } catch (err) {
            server.config.logger.error(err.message)
            server.ws.send({ type: 'error', err: { message: err.message, stack: '' } })
          }
        }, 50)
      }
      for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, regenerate)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // expose .env.local (no VITE_ prefix needed) to the dev api handler only;
  // it never reaches the browser bundle
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'SPOTIFY_'))

  return {
    plugins: [devApi(), leetcodePages()],
    server: {
      // Listen on all interfaces so Windows (and Tailscale Serve) can reach WSL.
      host: true,
      port: 5173,
      // Fail instead of silently moving to another port — Tailscale Serve proxies 5173.
      strictPort: true,
      // Allow requests via the Tailscale MagicDNS names.
      allowedHosts: ['.ts.net', 'clarence-pc'],
    },
  }
})
