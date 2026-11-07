// Vercel function: GET /api/spotify -> the track playing on spotify right now,
// or the last one played if nothing is playing.
//
// Needs three env vars (vercel project settings, or .env.local for dev):
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
// The refresh token comes from `npm run spotify-token` (one-time setup).

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const NOW_URL = 'https://api.spotify.com/v1/me/player/currently-playing'
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

// The track playing right now, or null (nothing playing, an ad/podcast, or the
// request failed) so the caller falls back to recently played.
async function nowPlaying(token) {
  const res = await fetch(NOW_URL, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status !== 200) return null
  const data = await res.json()
  return data.is_playing && data.currently_playing_type === 'track' ? data.item : null
}

async function lastPlayed(token) {
  const res = await fetch(RECENT_URL, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`recently-played failed: ${res.status}`)
  const track = (await res.json()).items?.[0]?.track
  if (!track) throw new Error('no recent tracks')
  return track
}

export async function GET() {
  try {
    const token = await accessToken()
    const current = await nowPlaying(token).catch(() => null)
    const track = current ?? (await lastPlayed(token))

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
        isPlaying: Boolean(current),
      },
      // the CDN serves one copy for 30s, so visitors don't each hit spotify
      { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=300' } },
    )
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'unavailable' }, { status: 502 })
  }
}
