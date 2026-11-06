// One-time helper: authorise the spotify app against your account and print a
// refresh token for SPOTIFY_REFRESH_TOKEN.
//
//   1. create an app at https://developer.spotify.com/dashboard
//      redirect uri: http://127.0.0.1:8888/callback   (web api)
//   2. put SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local
//   3. npm run spotify-token, open the printed link, approve
//   4. copy the printed token into .env.local and the vercel project env vars

import { createServer } from 'node:http'

process.loadEnvFile?.('.env.local')
const id = process.env.SPOTIFY_CLIENT_ID
const secret = process.env.SPOTIFY_CLIENT_SECRET
if (!id || !secret) {
  console.error('set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local first')
  process.exit(1)
}

const REDIRECT = 'http://127.0.0.1:8888/callback'
const authUrl =
  'https://accounts.spotify.com/authorize?' +
  new URLSearchParams({
    client_id: id,
    response_type: 'code',
    redirect_uri: REDIRECT,
    scope: 'user-read-recently-played',
  })

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT)
  if (url.pathname !== '/callback') return res.writeHead(404).end()

  const code = url.searchParams.get('code')
  if (!code) {
    res.end(`authorisation failed: ${url.searchParams.get('error')}`)
    return server.close()
  }

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
  })
  const data = await tokenRes.json()

  if (data.refresh_token) {
    console.log(`\nSPOTIFY_REFRESH_TOKEN=${data.refresh_token}\n`)
    res.end('done - the refresh token is printed in your terminal. you can close this tab.')
  } else {
    console.error(data)
    res.end('token exchange failed - see terminal')
  }
  server.close()
})

server.listen(8888, '127.0.0.1', () => {
  console.log(`open this link and approve:\n\n${authUrl}\n`)
})
