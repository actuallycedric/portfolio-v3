import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    // Listen on all interfaces so Windows (and Tailscale Serve) can reach WSL.
    host: true,
    port: 5173,
    // Fail instead of silently moving to another port — Tailscale Serve proxies 5173.
    strictPort: true,
    // Allow requests via the Tailscale MagicDNS names.
    allowedHosts: ['.ts.net', 'clarence-pc'],
  },
})
