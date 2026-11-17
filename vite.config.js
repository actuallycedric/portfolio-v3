import { defineConfig, loadEnv } from 'vite'

// Vercel runs api/*.js as functions in production; the vite dev server
// doesn't, so this routes /api/<name> to the same handlers during `npm run dev`.
function devApi() {
  return {
    name: 'dev-api',
    configureServer(server) {
      for (const name of ['spotify']) {
        server.middlewares.use(`/api/${name}`, async (req, res) => {
          const handlers = await server.ssrLoadModule(`/api/${name}.js`)
          const handler = handlers[req.method]
          if (!handler) {
            res.statusCode = 405
            return res.end()
          }
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const request = new Request(new URL(req.originalUrl ?? req.url, 'http://localhost'), {
            method: req.method,
            headers: { authorization: req.headers.authorization ?? '', 'content-type': req.headers['content-type'] ?? '' },
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          })
          const response = await handler(request)
          res.statusCode = response.status
          res.setHeader('Content-Type', 'application/json')
          res.end(await response.text())
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // expose .env.local (no VITE_ prefix needed) to the dev api handlers only;
  // it never reaches the browser bundle
  Object.assign(process.env, loadEnv(mode, process.cwd(), ['SPOTIFY_']))

  return {
    plugins: [devApi()],
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
