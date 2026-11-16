// Generates the static /leetcode pages from data/ and content/leetcode/.
// Output goes to leetcode/ at the project root (git-ignored) so vite can treat
// each page as a normal html entry: same css pipeline, same fonts.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Marked } from 'marked'
import { bundledThemes, createHighlighter } from 'shiki'
import { ROOT, loadAll } from './lib.mjs'

export const OUT_DIR = join(ROOT, 'leetcode')

const TOTAL_EXPECTED = 150
const isSolved = (status) => status === 'solved' || status === 'review'

const GLYPH = { solved: '✓', attempted: '½', review: '↻', todo: '' }
const STATUS_LABEL = { solved: 'solved', attempted: 'attempted', review: 'solved, flagged for review', todo: 'not started' }

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const pageHref = (slug) => `/leetcode/${slug}/`

// ---------- markdown + highlighting ----------
// everforest's light colours are made for #fdf6e3 and some (yellow, green)
// fall below AA on the site's cream code blocks. Darken each colour only as
// far as it needs to reach 4.5:1, so the hues stay the same.
const CODE_BG_LIGHT = [245, 230, 196] // .lc-prose pre in light mode: 30% --rule over --bg

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function readable(hex) {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex)
  if (!m) return hex
  const rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
  const bg = luminance(CODE_BG_LIGHT)
  let k = 1
  const at = () => rgb.map((v) => Math.round(v * k))
  while (k > 0 && (bg + 0.05) / (luminance(at()) + 0.05) < 4.6) k -= 0.02
  return `#${at().map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

async function lightTheme() {
  const { default: theme } = await bundledThemes['everforest-light']()
  const fix = (s) => s?.foreground && (s.foreground = readable(s.foreground))
  const copy = structuredClone(theme)
  for (const t of copy.tokenColors ?? copy.settings ?? []) fix(t.settings)
  if (copy.fg) copy.fg = readable(copy.fg)
  if (copy.colors?.['editor.foreground']) copy.colors['editor.foreground'] = readable(copy.colors['editor.foreground'])
  copy.name = 'everforest-light-aa'
  return copy
}

async function makeRenderer(solutions) {
  const langs = new Set(['python'])
  for (const s of solutions.values()) {
    if (s.lang) langs.add(s.lang)
    for (const m of s.body.matchAll(/^```([\w+#-]+)/gm)) langs.add(m[1])
  }
  const themes = [await lightTheme(), 'everforest-dark']
  const highlighter = await createHighlighter({
    themes,
    langs: [...langs].filter((l) => l !== 'text'),
  }).catch(() =>
    // an unknown language in some file: load python only and let the
    // per-block lookup below render the rest as plain text
    createHighlighter({ themes, langs: ['python'] }),
  )
  const loaded = new Set(highlighter.getLoadedLanguages())

  const marked = new Marked({
    renderer: {
      code({ text, lang }) {
        const l = (lang || '').trim().split(/\s/)[0]
        return highlighter.codeToHtml(text, {
          lang: loaded.has(l) ? l : 'text',
          themes: { light: 'everforest-light-aa', dark: 'everforest-dark' },
          defaultColor: false,
        })
      },
    },
  })
  // drop sections left empty from the template (a heading followed by nothing
  // or by an empty code fence) so they don't render as bare headings
  const stripEmpty = (md) => md.replace(/^#{2,6} .*\n(?:\s*```[\w+#-]*\s*\n\s*```\s*\n?|\s*)(?=^#{2,6} |(?![\s\S]))/gm, '')
  return (md) => marked.parse(stripEmpty(md))
}

// ---------- shared chrome ----------
const ENTRY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/><line x1="14" y1="4" x2="10" y2="20"/></svg>`

function topbar() {
  return `<nav class="topbar">
        <a class="brand" href="/">clarence cesante</a>
        <div class="topbar-right">
          <ul class="nav-icons">
            <li>
              <button class="theme-toggle" type="button" aria-label="toggle light/dark mode">
                <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
                <svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              </button>
            </li>
            <li><a class="lc-entry" href="/" aria-label="Back to the home page">${ENTRY_ICON}<span class="lc-entry-tip" aria-hidden="true">back to home</span></a></li>
          </ul>
        </div>
      </nav>`
}

// compact search index: [title, href, status, isOwnPage]
function searchData(topics) {
  const rows = topics.flatMap((t) =>
    t.problems.map((p) => [p.title, p.solution ? pageHref(p.slug) : p.leetcode, p.status, p.solution ? 1 : 0]),
  )
  return JSON.stringify(rows).replace(/</g, '\\u003c')
}

function searchDialog() {
  return `<dialog class="lc-search" aria-label="search problems">
      <form method="dialog" class="lc-search-form" role="search">
        <input type="text" class="lc-search-input" placeholder="search the neetcode 150…" aria-label="search problems" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="lc-results" aria-autocomplete="list" />
        <ul id="lc-results" class="lc-results" role="listbox" aria-label="results"></ul>
        <p class="lc-search-hint" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>enter</kbd> open · <kbd>esc</kbd> close</p>
      </form>
    </dialog>`
}

function page({ title, description, body, topics, scripts = '' }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <meta name="description" content="${esc(description)}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preload" href="/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/src/style.css" />
    <link rel="stylesheet" href="/src/leetcode.css" />
    <title>${esc(title)}</title>
    <script>
      try {
        const t = localStorage.getItem('theme')
        if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
      } catch {}
    </script>
  </head>
  <body>
    <div class="wrap">
      ${topbar()}
      <main class="lc">
${body}
      </main>
    </div>
    ${searchDialog()}
    <script type="application/json" id="lc-data">${searchData(topics)}</script>
    <script type="module" src="/src/leetcode.js"></script>${scripts}
  </body>
</html>
`
}

// ---------- pieces ----------
function checkbox(status) {
  return `<span class="lc-check" data-status="${status}" role="img" aria-label="${STATUS_LABEL[status]}">${GLYPH[status]}</span>`
}

function difficultyDot(difficulty) {
  return `<span class="lc-dot" data-difficulty="${difficulty}" title="${difficulty}"><span class="visually-hidden">${difficulty}</span></span>`
}

function lcLink(p) {
  return `<a class="lc-out" href="${esc(p.leetcode)}" target="_blank" rel="noopener noreferrer">LC<span aria-hidden="true">↗</span><span class="visually-hidden"> ${esc(p.title)} on LeetCode, opens in a new tab</span></a>`
}

function topicStats(t) {
  const solved = t.problems.filter((p) => isSolved(p.status)).length
  const touched = t.problems.some((p) => p.status !== 'todo')
  const state = solved === t.problems.length ? 'done' : touched ? 'active' : 'todo'
  return { solved, total: t.problems.length, state }
}

// ---------- roadmap ----------
const NODE_W = 160
const NODE_H = 56

function roadmap(topics) {
  const bySlug = new Map(topics.map((t) => [t.slug, t]))
  const maxX = Math.max(...topics.map((t) => t.x)) + NODE_W / 2 + 10
  const maxY = Math.max(...topics.map((t) => t.y)) + NODE_H / 2 + 10
  const minX = Math.min(...topics.map((t) => t.x)) - NODE_W / 2 - 10
  const minY = Math.min(...topics.map((t) => t.y)) - NODE_H / 2 - 10

  const edges = topics
    .flatMap((t) =>
      t.prereqs.map((pre) => {
        const a = bySlug.get(pre)
        return `<line x1="${a.x}" y1="${a.y + NODE_H / 2}" x2="${t.x}" y2="${t.y - NODE_H / 2}" />`
      }),
    )
    .join('')

  const barW = NODE_W - 32
  const nodes = topics
    .map((t) => {
      const { solved, total, state } = topicStats(t)
      const x0 = t.x - NODE_W / 2
      const y0 = t.y - NODE_H / 2
      const fill = total ? (barW * solved) / total : 0
      return `<a class="rm-node" data-state="${state}" href="#${t.slug}" aria-label="${esc(t.label)}, ${solved} of ${total} solved">
          <rect class="rm-box" x="${x0}" y="${y0}" width="${NODE_W}" height="${NODE_H}" rx="10" />
          <text class="rm-label" x="${t.x}" y="${t.y - 4}" text-anchor="middle">${esc(t.label)}</text>
          <text class="rm-count" x="${t.x}" y="${t.y + 13}" text-anchor="middle">${solved}/${total}</text>
          <rect class="rm-track" x="${t.x - barW / 2}" y="${t.y + 19}" width="${barW}" height="3" rx="1.5" />
          ${fill ? `<rect class="rm-fill" x="${t.x - barW / 2}" y="${t.y + 19}" width="${fill.toFixed(1)}" height="3" rx="1.5" />` : ''}
        </a>`
    })
    .join('\n        ')

  return `<nav class="lc-roadmap" aria-label="topic roadmap">
        <svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}">
          <g class="rm-edges" aria-hidden="true">${edges}</g>
        ${nodes}
        </svg>
      </nav>`
}

// ---------- /leetcode ----------
function indexPage(topics) {
  const all = topics.flatMap((t) => t.problems)
  const solved = all.filter((p) => isSolved(p.status)).length
  const total = all.length
  const pct = ((solved / total) * 100).toFixed(1)

  const sections = topics
    .map((t) => {
      const { solved: s, total: n, state } = topicStats(t)
      const rows = t.problems
        .map((p) => {
          const title = p.solution
            ? `<a class="lc-title" href="${pageHref(p.slug)}">${esc(p.title)}</a>`
            : `<span class="lc-title">${esc(p.title)}</span>`
          const go = p.solution
            ? `<a class="lc-go" href="${pageHref(p.slug)}" tabindex="-1" aria-hidden="true">→</a>`
            : `<span class="lc-go" aria-hidden="true"></span>`
          return `<li class="lc-row" data-status="${p.status}">${checkbox(p.status)}${title}${difficultyDot(p.difficulty)}${lcLink(p)}${go}</li>`
        })
        .join('\n            ')
      return `<details class="lc-topic" id="${t.slug}" data-state="${state}">
          <summary><span class="lc-topic-name">${esc(t.label)}</span><span class="lc-topic-count">${s} / ${n}</span></summary>
          <ol class="lc-rows">
            ${rows}
          </ol>
        </details>`
    })
    .join('\n        ')

  const body = `        <header class="lc-header">
          <h1>NeetCode 150 <span class="lc-sep">·</span> <span class="lc-num">${solved} / ${total}</span></h1>
          <div class="lc-progress" role="progressbar" aria-label="problems solved" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${solved}"><span style="width: ${pct}%"></span></div>
        </header>
        ${roadmap(topics)}
        <section class="lc-list" aria-label="checklist">
          <div class="lc-tools">
            <fieldset class="lc-filters">
              <legend class="visually-hidden">filter problems</legend>
              <label><input type="radio" name="lc-filter" value="all" checked />all</label>
              <label><input type="radio" name="lc-filter" value="unsolved" />unsolved</label>
              <label><input type="radio" name="lc-filter" value="review" />review</label>
            </fieldset>
            <button class="lc-search-open" type="button" hidden>search <kbd>/</kbd></button>
          </div>
        ${sections}
          <p class="lc-none">nothing here right now.</p>
        </section>`

  return page({
    title: 'neetcode 150 · clarence cesante',
    description: `my neetcode 150 progress: ${solved} of ${total} solved`,
    body,
    topics,
  })
}

// ---------- /leetcode/[slug] ----------
function solutionPage(p, topic, render, topics) {
  const s = p.solution
  const withPages = topic.problems.filter((q) => q.solution)
  const i = withPages.findIndex((q) => q.slug === p.slug)
  const prev = withPages[i - 1]
  const next = withPages[i + 1]
  const meta = [
    `<a href="/leetcode/#${topic.slug}">${esc(topic.label)}</a>`,
    `${difficultyDot(p.difficulty)}<span aria-hidden="true">${p.difficulty}</span>`,
    s.time && `<span><span class="lc-k">time</span> <code>${esc(s.time)}</code></span>`,
    s.space && `<span><span class="lc-k">space</span> <code>${esc(s.space)}</code></span>`,
    s.date && `<time datetime="${esc(s.date)}">${esc(s.date)}</time>`,
    lcLink(p),
  ].filter(Boolean)

  const body = `        <article class="lc-solution">
          <header class="lc-sol-head">
            <p class="lc-sol-status">${checkbox(p.status)}<span>${STATUS_LABEL[p.status]}</span></p>
            <h1>${esc(p.title)}</h1>
            <p class="lc-meta">${meta.join('<span class="lc-sep" aria-hidden="true">·</span>')}</p>
          </header>
          <div class="lc-prose">
${render(s.body)}
          </div>
        </article>
        <nav class="lc-pager" aria-label="more in ${esc(topic.label)}">
          ${prev ? `<a class="lc-prev" href="${pageHref(prev.slug)}" rel="prev"><span aria-hidden="true">←</span> ${esc(prev.title)}</a>` : '<span></span>'}
          <a class="lc-back" href="/leetcode/#${topic.slug}">back to map</a>
          ${next ? `<a class="lc-next" href="${pageHref(next.slug)}" rel="next">${esc(next.title)} <span aria-hidden="true">→</span></a>` : '<span></span>'}
        </nav>`

  return page({
    title: `${p.title} · neetcode 150`,
    description: `my notes and solution for ${p.title}`,
    body,
    topics,
  })
}

// ---------- /leetcode/edit ----------
// The form posts to api/leetcode.js. Every problem ships in the page for the
// picker; the file itself is fetched when one is picked, so it's always current.
const COMPLEXITIES = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n + m)', 'O(n · m)', 'O(n²)', 'O(n³)', 'O(2ⁿ)', 'O(n · 2ⁿ)', 'O(n!)', 'O(h)', 'O(V + E)', 'O(E log V)', 'O(k)', 'O(n log k)']
const LANGS = ['python', 'java', 'cpp', 'c', 'javascript', 'typescript', 'go', 'rust', 'csharp', 'kotlin', 'swift']

function editPage(topics) {
  const data = topics.flatMap((t) => t.problems.map((p) => [p.slug, p.title, t.label, p.difficulty, p.status, p.leetcode]))
  const options = (list) => list.map((v) => `<option value="${esc(v)}"></option>`).join('')
  const statusRadio = (value, hint) =>
    `<label class="lc-chip"><input type="radio" name="status" value="${value}"${value === 'attempted' ? ' checked' : ''} />${checkbox(value)}<span>${value}</span><span class="visually-hidden">: ${hint}</span></label>`

  const body = `        <section class="lc-edit">
          <header class="lc-edit-head">
            <h1>edit notes</h1>
            <a class="lc-edit-back" href="/leetcode/">back to map</a>
          </header>

          <form class="lc-lock" autocomplete="on">
            <input type="text" name="username" value="neetcode" autocomplete="username" hidden />
            <label class="lc-label" for="lc-pw">password</label>
            <div class="lc-lock-row">
              <input class="lc-input" id="lc-pw" type="password" autocomplete="current-password" required />
              <button class="lc-btn" type="submit">unlock</button>
            </div>
            <label class="lc-remember"><input type="checkbox" id="lc-remember" /> remember on this device</label>
            <p class="lc-msg" role="status"></p>
          </form>

          <form class="lc-form" hidden novalidate>
            <div class="lc-field lc-pick">
              <label class="lc-label" for="lc-problem">problem</label>
              <input class="lc-input" id="lc-problem" type="text" placeholder="start typing a title…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="lc-pick-list" aria-autocomplete="list" />
              <ul id="lc-pick-list" class="lc-results lc-pick-list" role="listbox" aria-label="problems" hidden></ul>
              <p class="lc-picked" aria-live="polite"></p>
            </div>

            <fieldset class="lc-field lc-chips">
              <legend class="lc-label">status</legend>
              ${statusRadio('attempted', 'tried it, not done')}
              ${statusRadio('solved', 'done')}
              ${statusRadio('review', 'solved, but redo it later')}
            </fieldset>

            <div class="lc-edit-grid">
              <div class="lc-field"><label class="lc-label" for="lc-date">date</label><input class="lc-input lc-mono" id="lc-date" name="date" type="date" /></div>
              <div class="lc-field"><label class="lc-label" for="lc-time">time</label><input class="lc-input lc-mono" id="lc-time" name="time" list="lc-complexities" placeholder="O(n)" autocomplete="off" /></div>
              <div class="lc-field"><label class="lc-label" for="lc-space">space</label><input class="lc-input lc-mono" id="lc-space" name="space" list="lc-complexities" placeholder="O(1)" autocomplete="off" /></div>
              <div class="lc-field"><label class="lc-label" for="lc-lang">language</label><input class="lc-input lc-mono" id="lc-lang" name="lang" list="lc-langs" value="python" autocomplete="off" /></div>
            </div>
            <datalist id="lc-complexities">${options(COMPLEXITIES)}</datalist>
            <datalist id="lc-langs">${options(LANGS)}</datalist>

            <div class="lc-field"><label class="lc-label" for="lc-approach">approach</label><textarea class="lc-input" id="lc-approach" name="approach" rows="4" placeholder="the idea in a sentence or two. markdown works."></textarea></div>
            <div class="lc-field"><label class="lc-label" for="lc-code">code <span class="lc-hint">tab indents · esc then tab to leave</span></label><textarea class="lc-input lc-mono lc-code" id="lc-code" name="code" rows="12" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea></div>
            <div class="lc-field"><label class="lc-label" for="lc-notes">notes</label><textarea class="lc-input" id="lc-notes" name="notes" rows="4" placeholder="- gotchas, edge cases, other approaches"></textarea></div>
            <details class="lc-field lc-extra" hidden>
              <summary class="lc-label">other sections in this file</summary>
              <textarea class="lc-input lc-mono" id="lc-extra" name="extra" rows="6" spellcheck="false"></textarea>
            </details>

            <div class="lc-actions">
              <button class="lc-btn lc-save" type="submit" disabled>save</button>
              <span class="lc-hint" aria-hidden="true"><kbd>ctrl</kbd> <kbd>s</kbd></span>
              <p class="lc-msg" role="status"></p>
              <button class="lc-link lc-logout" type="button">lock</button>
            </div>
          </form>
        </section>`

  return page({
    title: 'edit · neetcode 150',
    description: 'edit my neetcode 150 notes',
    body,
    topics,
    scripts: `
    <script type="application/json" id="lc-edit-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
    <script type="module" src="/src/leetcode-edit.js"></script>`,
  })
}

// Validates, then writes every page. Returns the absolute paths of the html
// files written. Throws ValidationError on bad data.
export async function generate() {
  const { topics, solutions } = loadAll()
  const all = topics.flatMap((t) => t.problems)
  if (all.length !== TOTAL_EXPECTED) throw new Error(`expected ${TOTAL_EXPECTED} problems, got ${all.length}`)
  const render = await makeRenderer(solutions)

  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })
  const written = []
  const write = (rel, html) => {
    const file = join(OUT_DIR, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, html)
    written.push(file)
  }

  write('index.html', indexPage(topics))
  write('edit/index.html', editPage(topics))
  for (const t of topics) {
    for (const p of t.problems) {
      if (p.solution) write(`${p.slug}/index.html`, solutionPage(p, t, render, topics))
    }
  }
  return written
}

// `node scripts/leetcode/build.mjs` validates and generates on its own
if (import.meta.url === `file://${process.argv[1]}`) {
  generate()
    .then((files) => console.log(`generated ${files.length} leetcode pages`))
    .catch((err) => {
      console.error(err.message)
      process.exit(1)
    })
}
