# portfolio v3

reworked portfolio with static js - plain html, css and a few lines of javascript. vite is only used as the dev server and bundler.

## layout

- `index.html` - all page content
- `src/style.css` - styles (geist font, light/dark tokens)
- `src/main.js` - runs the light/dark toggle
- `public/icons.svg` - skill icon sprite (from simple-icons, cc0)
- `public/photos/` - favourite movie artwork
- `src/theme.js` - light/dark toggle, shared by every page

## neetcode 150 (`/leetcode`)

a hidden section: the `</>` icon in the top bar is the only link to it, and the pages are `noindex`.

- `data/neetcode150.json` - the 150 problems (title, topic, difficulty, link, order within topic)
- `data/topics.json` - the 18 topics, their roadmap position (x/y) and prereq edges
- `content/leetcode/<slug>.md` - my solution for a problem; no file = not started
- `scripts/leetcode/` - validation (`lib.mjs`), page generator (`build.mjs`), scaffold (`new.mjs`)
- `src/leetcode.css`, `src/leetcode.js` - styles, search (ctrl/cmd+k or /), j/k paging

new solution: `npm run lc two-sum` creates `content/leetcode/two-sum.md` with `status: attempted`; change it to `solved` (or `review` to flag a redo) when done.

`vite build` generates the pages into `leetcode/` (git-ignored) before bundling and fails with a list of problems if the catalog counts, slugs, statuses or topic prereqs don't check out. `npm run dev` regenerates them whenever `content/` or `data/` changes.

## spotify

`api/spotify.js` is a vercel function that returns the track playing right now, or the most recently played one if nothing is playing; `src/main.js` fills the card with it (baby boy shows if it fails). in dev, `vite.config.js` serves the same handler.

setup (once):

1. create an app at https://developer.spotify.com/dashboard with redirect uri `http://127.0.0.1:8888/callback`
2. add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` to `.env.local`
3. `npm run spotify-token`, open the link, approve, and add the printed `SPOTIFY_REFRESH_TOKEN` to `.env.local`
4. add all three to the vercel project's environment variables and redeploy
