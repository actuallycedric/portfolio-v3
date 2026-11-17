# portfolio v4 (prototype)

white-field redesign: helvetica neue / inter tight, black "goo" blob shapes, a bottom dock, and one accent, an animated sage-to-moss leaf mesh gradient. still plain html, css and a few lines of javascript; vite is only the dev server and bundler.

## layout

- `index.html` - all page content
- `src/style.css` - styles (light/dark tokens, leaf mesh, blob animations)
- `src/main.js` - email copy, spotify card, marquee, carousel, scroll reveals, dock highlighting
- `public/icons.svg` - skill icon sprite (from simple-icons, cc0)
- `public/photos/` - favourite movie artwork
- `src/theme.js` - light/dark toggle, shared by every page

## spotify

`api/spotify.js` is a vercel function that returns the track playing right now, or the most recently played one if nothing is playing; `src/main.js` fills the card with it (baby boy shows if it fails). in dev, `vite.config.js` serves the same handler.

setup (once):

1. create an app at https://developer.spotify.com/dashboard with redirect uri `http://127.0.0.1:8888/callback`
2. add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` to `.env.local`
3. `npm run spotify-token`, open the link, approve, and add the printed `SPOTIFY_REFRESH_TOKEN` to `.env.local`
4. add all three to the vercel project's environment variables and redeploy
