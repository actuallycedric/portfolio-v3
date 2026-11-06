// Vercel function: GET /api/spotify -> the last track played on spotify.
//
// Needs three env vars (vercel project settings, or .env.local for dev):
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
// The refresh token comes from `npm run spotify-token` (one-time setup).

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const RECENT_URL = 'https://api.spotify.com/v1/me/player/recently-played?limit=1'

async function accessToken() {
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret, SPOTIFY_REFRESH_TOKEN: refresh } =
    process.env
  if (!id || !secret || !refresh) throw new Error('spotify env vars missing')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
  })
  if (!res.ok) throw new Error(`token request failed: ${res.status}`)
  return (await res.json()).access_token
}

// Drop guest credits from a track title: they're already in the artist list.
// "wat's wrong (feat. zacari & kendrick lamar)" -> "wat's wrong"
// "Sacrifices (with EARTHGANG & J. Cole feat. Smino & Saba)" -> "Sacrifices"
// feat/ft/featuring groups always go. "(with ...)" only goes when it names a
// credited artist, so a title like "Stay (With Me)" survives. Other brackets
// ("(Remix)", "[Live]") are kept.
export function cleanTitle(title, artists = []) {
  const names = artists.map((a) => a.toLowerCase())
  const credits = (text) => names.some((name) => text.toLowerCase().includes(name))

  return title
    .replace(/\s*[([]\s*(feat\.?|ft\.?|featuring|with)\s+([^)\]]*)[)\]]/gi, (group, word, rest) =>
      word.toLowerCase() === 'with' && !credits(rest) ? group : '',
    )
    .replace(/\s+-\s+(feat\.?|ft\.?|featuring)\s.*$/i, '') // "song - feat. x"
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export async function GET() {
  try {
    const res = await fetch(RECENT_URL, {
      headers: { Authorization: `Bearer ${await accessToken()}` },
    })
    if (!res.ok) throw new Error(`recently-played failed: ${res.status}`)

    const item = (await res.json()).items?.[0]
    if (!item) throw new Error('no recent tracks')

    const { track, played_at: playedAt } = item
    // album images come largest first; ~300px is plenty for the 6rem cover
    const images = track.album.images
    const image = images.find((img) => img.width <= 300) ?? images[0]

    return Response.json(
      {
        title: cleanTitle(
          track.name,
          track.artists.map((a) => a.name),
        ),
        artist: track.artists.map((a) => a.name).join(', '),
        album: track.album.name,
        image: image?.url ?? null,
        url: track.external_urls.spotify,
        playedAt,
      },
      // the CDN serves one copy for a minute, so visitors don't each hit spotify
      { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } },
    )
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'unavailable' }, { status: 502 })
  }
}
