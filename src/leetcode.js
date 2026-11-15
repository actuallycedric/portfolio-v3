// /leetcode pages: quick-jump search, roadmap/hash -> open topic, filter
// helpers, and prev/next keys on solution pages. Everything else is static.
import './theme.js'

const GLYPH = { solved: '✓', attempted: '½', review: '↻', todo: '' }
const STATUS_LABEL = { solved: 'solved', attempted: 'attempted', review: 'review', todo: 'not started' }

const typing = (el) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

// ---------- topics: open the one in the hash ----------
function openTopic(id, scroll) {
  const topic = id && document.getElementById(id)
  if (!(topic instanceof HTMLDetailsElement)) return
  topic.open = true
  if (scroll) topic.scrollIntoView({ block: 'start' })
}

const fromHash = () => decodeURIComponent(location.hash.slice(1))
openTopic(fromHash(), true)
addEventListener('hashchange', () => openTopic(fromHash(), true))

// clicking the node for the topic already in the hash fires no hashchange
document.querySelectorAll('.rm-node').forEach((node) => {
  node.addEventListener('click', () => openTopic(node.getAttribute('href').slice(1), false))
})

// ---------- filters: css hides rows; open the topics that still have some ----------
document.querySelectorAll('input[name="lc-filter"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.value === 'all') return
    const show = radio.value === 'review' ? ['review'] : ['todo', 'attempted']
    document.querySelectorAll('.lc-topic').forEach((topic) => {
      if (show.some((s) => topic.querySelector(`.lc-row[data-status="${s}"]`))) topic.open = true
    })
  })
})

// ---------- quick-jump search ----------
const dialog = document.querySelector('.lc-search')
const input = dialog.querySelector('.lc-search-input')
const list = dialog.querySelector('.lc-results')
const problems = JSON.parse(document.getElementById('lc-data').textContent).map(([title, href, status, own]) => ({
  title,
  lower: title.toLowerCase(),
  href,
  status,
  own: own === 1,
}))
let results = []
let active = 0

// lower is better; null = no match. Substring hits beat subsequence hits,
// earlier and word-start hits beat later ones.
function score(lower, q) {
  const at = lower.indexOf(q)
  if (at === 0) return 0
  if (at > 0) return (/\W/.test(lower[at - 1]) ? 1 : 2) + at / 1000
  let i = 0
  let gaps = 0
  let last = -1
  const chars = q.replace(/\s+/g, '')
  for (const c of chars) {
    const found = lower.indexOf(c, last + 1)
    if (found === -1) return null
    if (last !== -1) gaps += found - last - 1
    last = found
    i++
  }
  return i ? 10 + gaps / 100 : null
}

function search(q) {
  q = q.trim().toLowerCase()
  if (!q) return []
  return problems
    .map((p, order) => ({ p, s: score(p.lower, q), order }))
    .filter((r) => r.s !== null)
    .sort((a, b) => a.s - b.s || a.order - b.order)
    .slice(0, 8)
    .map((r) => r.p)
}

function render() {
  list.replaceChildren(
    ...results.map((p, i) => {
      const li = document.createElement('li')
      li.id = `lc-opt-${i}`
      li.role = 'option'
      li.className = 'lc-result'
      li.setAttribute('aria-selected', String(i === active))
      li.dataset.status = p.status
      const check = document.createElement('span')
      check.className = 'lc-check'
      check.dataset.status = p.status
      check.textContent = GLYPH[p.status]
      check.setAttribute('aria-hidden', 'true')
      const title = document.createElement('span')
      title.className = 'lc-result-title'
      title.textContent = p.title
      const where = document.createElement('span')
      where.className = 'lc-result-where'
      where.textContent = p.own ? 'notes' : 'LC↗'
      const sr = document.createElement('span')
      sr.className = 'visually-hidden'
      sr.textContent = `, ${STATUS_LABEL[p.status]}${p.own ? '' : ', opens leetcode'}`
      li.append(check, title, sr, where)
      li.addEventListener('mousemove', () => {
        if (active !== i) {
          active = i
          render()
        }
      })
      li.addEventListener('click', () => go(p))
      return li
    }),
  )
  if (!results.length && input.value.trim()) {
    const li = document.createElement('li')
    li.className = 'lc-empty'
    li.textContent = 'no matches'
    list.append(li)
  }
  input.setAttribute('aria-activedescendant', results.length ? `lc-opt-${active}` : '')
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
}

function go(p) {
  if (p.own) {
    location.href = p.href
  } else {
    dialog.close()
    window.open(p.href, '_blank', 'noopener')
  }
}

function openSearch() {
  if (dialog.open) return
  input.value = ''
  results = []
  active = 0
  render()
  dialog.showModal()
  input.focus()
}

input.addEventListener('input', () => {
  results = search(input.value)
  active = 0
  render()
})

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!results.length) return
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
    render()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (results[active]) go(results[active])
  }
})

// click on the backdrop closes
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close()
})

const opener = document.querySelector('.lc-search-open')
if (opener) {
  opener.hidden = false
  opener.addEventListener('click', openSearch)
}

// ---------- keys ----------
const prev = document.querySelector('.lc-pager .lc-prev')
const next = document.querySelector('.lc-pager .lc-next')
const back = document.querySelector('.lc-pager .lc-back')

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (dialog.open) dialog.close()
    else openSearch()
    return
  }
  // focus can still sit on the closed dialog's input for a moment after esc
  const typingOnPage = typing(e.target) && !dialog.contains(e.target)
  if (dialog.open || typingOnPage || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === '/') {
    e.preventDefault()
    openSearch()
  } else if (back && e.key === 'Escape') {
    location.href = back.href
  } else if (prev && (e.key === 'k' || e.key === 'ArrowLeft')) {
    location.href = prev.href
  } else if (next && (e.key === 'j' || e.key === 'ArrowRight')) {
    location.href = next.href
  }
})
