# portfolio v3

reworked portfolio with static js - plain html, css and a few lines of javascript. vite is only used as the dev server and bundler.

## layout

- `index.html` - all page content
- `src/style.css` - styles (geist font, light/dark tokens)
- `src/main.js` - runs the light/dark toggle
- `public/icons.svg` - skill icon sprite (from simple-icons, cc0)
- `public/photos/` - favourite movie artwork

## last played on spotify

`api/spotify.js` is a vercel function that returns the most recently played track; `src/main.js` fills the card with it (baby boy shows if it fails). in dev, `vite.config.js` serves the same handler.

setup (once):

1. create an app at https://developer.spotify.com/dashboard with redirect uri `http://127.0.0.1:8888/callback`
2. add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` to `.env.local`
3. `npm run spotify-token`, open the link, approve, and add the printed `SPOTIFY_REFRESH_TOKEN` to `.env.local`
4. add all three to the vercel project's environment variables and redeploy
