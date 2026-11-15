// Loads the neetcode 150 catalog, the roadmap topics and my solution files,
// and validates all three. No dependencies so the scaffold script can use it.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
export const CATALOG_PATH = join(ROOT, 'data/neetcode150.json')
export const TOPICS_PATH = join(ROOT, 'data/topics.json')
export const CONTENT_DIR = join(ROOT, 'content/leetcode')

// the neetcode 150 per-topic counts; the catalog must match these exactly
export const EXPECTED_COUNTS = {
  'arrays-hashing': 9,
  'two-pointers': 5,
  'sliding-window': 6,
  stack: 7,
  'binary-search': 7,
  'linked-list': 11,
  trees: 15,
  tries: 3,
  heap: 7,
  backtracking: 9,
  graphs: 13,
  'advanced-graphs': 6,
  'dp-1d': 12,
  'dp-2d': 11,
  greedy: 8,
  intervals: 6,
  'math-geometry': 8,
  'bit-manipulation': 7,
}

export const STATUSES = ['solved', 'attempted', 'review']
const DIFFICULTIES = ['easy', 'medium', 'hard']

export class ValidationError extends Error {
  constructor(problems) {
    super(`leetcode validation failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    this.name = 'ValidationError'
    // the list says where each problem is; a js stack trace would only add noise
    this.stack = this.message
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new ValidationError([`${path}: ${err.message}`])
  }
}

export function loadCatalog() {
  return readJson(CATALOG_PATH)
}

// Frontmatter is flat `key: value` lines; `# comments` are stripped.
// Returns { data, body } or null when the file has no frontmatter block.
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return null
  const data = {}
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf(':')
    if (i === -1) continue
    let value = line.slice(i + 1).trim()
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1)
    data[line.slice(0, i).trim()] = value
  }
  return { data, body: m[2] }
}

function loadSolutionFiles() {
  if (!existsSync(CONTENT_DIR)) return []
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => ({ file, text: readFileSync(join(CONTENT_DIR, file), 'utf8') }))
}

// Load everything and validate it. Throws one ValidationError listing every
// problem found, so a broken build shows all of them at once.
export function loadAll() {
  const catalog = loadCatalog()
  const topics = readJson(TOPICS_PATH)
  const problems = []

  // catalog: 150 unique slugs, known topics, per-topic counts
  if (!Array.isArray(catalog)) throw new ValidationError(['data/neetcode150.json must be an array'])
  const bySlug = new Map()
  const counts = {}
  for (const [i, p] of catalog.entries()) {
    const where = `data/neetcode150.json[${i}]${p?.slug ? ` (${p.slug})` : ''}`
    for (const key of ['slug', 'title', 'topic', 'difficulty', 'leetcode']) {
      if (typeof p?.[key] !== 'string' || !p[key]) problems.push(`${where}: missing "${key}"`)
    }
    if (!Number.isInteger(p?.order)) problems.push(`${where}: "order" must be an integer`)
    if (p?.difficulty && !DIFFICULTIES.includes(p.difficulty)) {
      problems.push(`${where}: difficulty "${p.difficulty}" must be one of ${DIFFICULTIES.join(' | ')}`)
    }
    if (p?.topic && !(p.topic in EXPECTED_COUNTS)) problems.push(`${where}: unknown topic "${p.topic}"`)
    if (bySlug.has(p?.slug)) problems.push(`${where}: duplicate slug`)
    bySlug.set(p?.slug, p)
    counts[p?.topic] = (counts[p?.topic] ?? 0) + 1
  }
  if (catalog.length !== 150) problems.push(`catalog has ${catalog.length} entries, expected 150`)
  if (bySlug.size !== catalog.length) problems.push(`catalog has ${bySlug.size} unique slugs, expected 150`)
  for (const [topic, expected] of Object.entries(EXPECTED_COUNTS)) {
    const got = counts[topic] ?? 0
    if (got !== expected) problems.push(`topic "${topic}" has ${got} problems in the catalog, expected ${expected}`)
  }
  for (const topic of Object.keys(counts)) {
    const list = catalog.filter((p) => p?.topic === topic)
    const orders = list.map((p) => p.order).sort((a, b) => a - b)
    if (orders.some((o, i) => o !== i + 1)) {
      problems.push(`topic "${topic}": "order" values must run 1..${list.length} with no gaps or repeats`)
    }
  }

  // topics: every topic has problems, prereqs point at real topics
  if (!Array.isArray(topics)) throw new ValidationError(['data/topics.json must be an array'])
  const topicSlugs = new Set(topics.map((t) => t.slug))
  for (const t of topics) {
    const where = `data/topics.json (${t.slug ?? '?'})`
    if (!t.label) problems.push(`${where}: missing "label"`)
    if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) problems.push(`${where}: "x" and "y" must be numbers`)
    if (!counts[t.slug]) problems.push(`${where}: topic has no problems in the catalog`)
    for (const pre of t.prereqs ?? []) {
      if (!topicSlugs.has(pre)) problems.push(`${where}: prereq "${pre}" is not a topic`)
    }
  }
  for (const topic of Object.keys(EXPECTED_COUNTS)) {
    if (!topicSlugs.has(topic)) problems.push(`data/topics.json: missing topic "${topic}"`)
  }

  // solutions: slug matches filename and catalog, status is known
  const solutions = new Map()
  for (const { file, text } of loadSolutionFiles()) {
    const where = `content/leetcode/${file}`
    const parsed = parseFrontmatter(text)
    if (!parsed) {
      problems.push(`${where}: missing frontmatter (--- block at the top)`)
      continue
    }
    const { data, body } = parsed
    const name = file.replace(/\.md$/, '')
    if (!data.slug) problems.push(`${where}: missing "slug"`)
    else if (data.slug !== name) problems.push(`${where}: slug "${data.slug}" doesn't match the filename "${name}"`)
    if (!bySlug.has(name)) problems.push(`${where}: "${name}" is not in the neetcode 150 catalog`)
    if (!STATUSES.includes(data.status)) {
      problems.push(`${where}: status "${data.status ?? ''}" must be one of ${STATUSES.join(' | ')}`)
    }
    if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) problems.push(`${where}: date must be YYYY-MM-DD`)
    solutions.set(name, { ...data, body })
  }

  if (problems.length) throw new ValidationError(problems)

  // problems with their solution attached, grouped by topic in roadmap order
  const sorted = [...catalog].sort((a, b) => a.order - b.order)
  const withStatus = (p) => ({ ...p, solution: solutions.get(p.slug) ?? null, status: solutions.get(p.slug)?.status ?? 'todo' })
  const groups = topics.map((t) => ({
    ...t,
    problems: sorted.filter((p) => p.topic === t.slug).map(withStatus),
  }))
  return { catalog, topics: groups, solutions }
}
