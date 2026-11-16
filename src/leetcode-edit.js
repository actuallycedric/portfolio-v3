// /leetcode/edit: password gate, problem picker, and the form that saves a
// solution through api/leetcode.js. Theme + quick-jump come from leetcode.js.
import { score } from './lc-match.js'

const GLYPH = { solved: '✓', attempted: '½', review: '↻', todo: '' }
const $ = (sel) => document.querySelector(sel)

const problems = JSON.parse($('#lc-edit-data').textContent).map(([slug, title, topic, difficulty, status, leetcode]) => ({
  slug,
  title,
  lower: title.toLowerCase(),
  topic,
  difficulty,
  status,
  leetcode,
}))
const bySlug = new Map(problems.map((p) => [p.slug, p]))

const lockForm = $('.lc-lock')
const form = $('.lc-form')
const pw = $('#lc-pw')
const remember = $('#lc-remember')
const picker = $('#lc-problem')
const pickList = $('#lc-pick-list')
const picked = $('.lc-picked')
const save = $('.lc-save')
const code = $('#lc-code')
const extra = $('.lc-extra')
const field = (name) => form.elements.namedItem(name)

// ---------- storage (each access can throw in private mode) ----------
const store = {
  get: (k) => {
    try {
      return sessionStorage.getItem(k) ?? localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v, durable) => {
    try {
      sessionStorage.setItem(k, v)
      if (durable) localStorage.setItem(k, v)
    } catch {}
  },
  drop: (k) => {
    try {
      sessionStorage.removeItem(k)
      localStorage.removeItem(k)
    } catch {}
  },
}

// ---------- api ----------
let password = ''

async function api(method, query = '', body) {
  const res = await fetch(`/api/leetcode${query}`, {
    method,
    headers: { Authorization: `Bearer ${password}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    lock('wrong password')
    throw new Error('wrong password')
  }
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`)
  return data
}

function say(where, text, tone = '') {
  const el = where.querySelector('.lc-msg')
  el.dataset.tone = tone
  el.replaceChildren(...(Array.isArray(text) ? text : [text]))
}

// ---------- lock / unlock ----------
function lock(message = '') {
  password = ''
  store.drop('lc-pw')
  form.hidden = true
  lockForm.hidden = false
  say(lockForm, message, message && 'error')
  pw.value = ''
  pw.focus()
}

async function unlock(candidate, durable) {
  password = candidate
  say(lockForm, 'checking…')
  try {
    const { mode } = await api('GET')
    store.set('lc-pw', candidate, durable)
    lockForm.hidden = true
    form.hidden = false
    form.dataset.mode = mode
    const slug = new URLSearchParams(location.search).get('slug')
    if (slug && bySlug.has(slug)) await choose(bySlug.get(slug))
    else picker.focus()
    const flash = store.get('lc-flash')
    if (flash) {
      store.drop('lc-flash')
      say(form, flash, 'ok')
    }
  } catch (err) {
    if (!lockForm.hidden) say(lockForm, err.message, 'error')
  }
}

lockForm.addEventListener('submit', (e) => {
  e.preventDefault()
  unlock(pw.value, remember.checked)
})

$('.lc-logout').addEventListener('click', () => {
  if (confirmLeave()) lock()
})

// ---------- picker ----------
let results = []
let active = 0

function search(q) {
  q = q.trim().toLowerCase()
  // nothing typed: suggest what's next (unfinished, in roadmap order)
  if (!q) return problems.filter((p) => p.status === 'todo' || p.status === 'attempted').slice(0, 8)
  return problems
    .map((p, order) => ({ p, s: Math.min(score(p.lower, q) ?? Infinity, p.slug.startsWith(q) ? 0 : Infinity), order }))
    .filter((r) => r.s !== Infinity)
    .sort((a, b) => a.s - b.s || a.order - b.order)
    .slice(0, 8)
    .map((r) => r.p)
}

function showResults(open) {
  pickList.hidden = !open
  picker.setAttribute('aria-expanded', String(open))
  if (!open) return picker.removeAttribute('aria-activedescendant')
  pickList.replaceChildren(
    ...results.map((p, i) => {
      const li = document.createElement('li')
      li.id = `lc-pick-${i}`
      li.role = 'option'
      li.className = 'lc-result'
      li.setAttribute('aria-selected', String(i === active))
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
      where.textContent = p.topic.toLowerCase()
      li.append(check, title, where)
      // mousedown, not click: fires before the input's blur closes the list
      li.addEventListener('mousedown', (e) => {
        e.preventDefault()
        choose(p)
      })
      return li
    }),
  )
  if (!results.length) {
    const li = document.createElement('li')
    li.className = 'lc-empty'
    li.textContent = 'no matches'
    pickList.append(li)
  }
  picker.setAttribute('aria-activedescendant', results.length ? `lc-pick-${active}` : '')
  pickList.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
}

const refresh = () => {
  results = search(picker.value)
  active = 0
  showResults(true)
}
picker.addEventListener('input', refresh)
picker.addEventListener('focus', () => {
  picker.select()
  refresh()
})
picker.addEventListener('blur', () => {
  showResults(false)
  if (current) picker.value = current.title
})
picker.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (pickList.hidden) return refresh()
    if (!results.length) return
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
    showResults(true)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (!pickList.hidden && results[active]) choose(results[active])
  } else if (e.key === 'Escape' && !pickList.hidden) {
    e.preventDefault()
    showResults(false)
  }
})

// ---------- loading a problem ----------
let current = null
let sha = null
let dirty = false

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Split a solution file into the form's fields. Sections other than
// approach/code/notes (and anything above the first heading) go to "extra"
// and are written back unchanged after the notes.
function parse(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  const meta = {}
  for (const raw of (m?.[1] ?? '').split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim()
    const i = line.indexOf(':')
    if (i > 0 && !line.startsWith('#')) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
  }
  const out = { ...meta, approach: '', code: '', notes: '', extra: [] }
  for (const part of (m?.[2] ?? text).replace(/\r\n/g, '\n').split(/^(?=## )/m)) {
    const head = /^## (.*)\n?/.exec(part)
    const name = head?.[1].trim().toLowerCase()
    const content = head ? part.slice(head[0].length) : part
    const fence = /^(`{3,})[^\n]*\n([\s\S]*?)^\1[ \t]*$/m.exec(content)
    if (name === 'approach' || name === 'notes') out[name] = content.trim()
    else if (name === 'code' && fence && !content.replace(fence[0], '').trim()) out.code = fence[2].replace(/\n$/, '')
    else if (part.trim()) out.extra.push(part.trim())
  }
  out.extra = out.extra.join('\n\n')
  return out
}

function fill(f) {
  for (const s of form.elements.namedItem('status')) s.checked = s.value === (f.status || 'attempted')
  field('date').value = f.date || today()
  field('time').value = f.time || ''
  field('space').value = f.space || ''
  field('lang').value = f.lang || store.get('lc-lang') || 'python'
  field('approach').value = f.approach || ''
  field('code').value = f.code || ''
  field('notes').value = f.notes || ''
  field('extra').value = f.extra || ''
  extra.hidden = !f.extra
  dirty = false
}

function describe(p, exists) {
  const link = document.createElement('a')
  link.href = p.leetcode
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = 'LC↗'
  const dot = document.createElement('span')
  dot.className = 'lc-dot'
  dot.dataset.difficulty = p.difficulty
  const bits = [p.topic.toLowerCase(), ' · ', dot, ` ${p.difficulty} · `, exists ? 'editing your notes' : 'new file', ' · ', link]
  if (exists) {
    const page = document.createElement('a')
    page.href = `/leetcode/${p.slug}/`
    page.textContent = 'view page'
    bits.push(' · ', page)
  }
  picked.replaceChildren(...bits)
}

async function choose(p) {
  showResults(false)
  if (current?.slug !== p.slug && !confirmLeave()) {
    picker.value = current?.title ?? ''
    return
  }
  current = p
  picker.value = p.title
  history.replaceState(null, '', `?slug=${p.slug}`)
  save.disabled = true
  picked.textContent = 'loading…'
  say(form, '')
  try {
    const file = await api('GET', `?slug=${encodeURIComponent(p.slug)}`)
    if (current !== p) return
    sha = file.sha ?? null
    fill(file.exists ? parse(file.content) : {})
    describe(p, file.exists)
    save.disabled = false
    field('approach').focus()
  } catch (err) {
    picked.textContent = ''
    say(form, err.message, 'error')
  }
}

// ---------- editing ----------
form.addEventListener('input', (e) => {
  if (e.target !== picker) dirty = true
})

const confirmLeave = () => !dirty || confirm('discard your unsaved changes?')
addEventListener('beforeunload', (e) => {
  if (dirty && !form.hidden) e.preventDefault()
})

// tab indents in the code box; esc lets the next tab move focus instead
let tabEscapes = false
code.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') tabEscapes = true
  if (e.key !== 'Tab' || tabEscapes || e.shiftKey) {
    if (e.key !== 'Escape') tabEscapes = false
    return
  }
  e.preventDefault()
  // execCommand keeps native undo; fall back to setRangeText
  if (!document.execCommand('insertText', false, '    ')) {
    code.setRangeText('    ', code.selectionStart, code.selectionEnd, 'end')
    dirty = true
  }
})
code.addEventListener('blur', () => (tabEscapes = false))

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !form.hidden) {
    e.preventDefault()
    if (!save.disabled) form.requestSubmit()
  }
})

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!current) return say(form, 'pick a problem first', 'error')
  const values = Object.fromEntries(new FormData(form))
  save.disabled = true
  say(form, 'saving…')
  try {
    const res = await api('PUT', '', { ...values, slug: current.slug, sha })
    sha = res.sha
    dirty = false
    current.status = values.status
    store.set('lc-lang', values.lang, true)
    describe(current, true)
    if (res.mode === 'local') {
      // the dev server regenerates and reloads the page; say it after
      const msg = `saved ${res.where}`
      store.set('lc-flash', msg)
      say(form, msg, 'ok')
    } else {
      const link = document.createElement('a')
      link.href = res.commit
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.textContent = 'commit'
      say(form, ['committed (', link, '). live in about a minute.'], 'ok')
    }
  } catch (err) {
    if (!form.hidden) say(form, err.message, 'error')
  } finally {
    save.disabled = !current
  }
})

// ---------- start ----------
const saved = store.get('lc-pw')
if (saved) unlock(saved, false)
else pw.focus()
