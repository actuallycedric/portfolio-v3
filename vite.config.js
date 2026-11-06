import { defineConfig, loadEnv } from 'vite'

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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // expose .env.local (no VITE_ prefix needed) to the dev api handler only;
  // it never reaches the browser bundle
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'SPOTIFY_'))

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
