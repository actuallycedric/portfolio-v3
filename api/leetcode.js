// Vercel function behind /leetcode/edit/: reads and saves my solution files.
//
//   GET  /api/leetcode            -> { ok: true } if the password is right
//   GET  /api/leetcode?slug=x     -> { exists, content, sha } for content/leetcode/x.md
//   PUT  /api/leetcode            -> writes the file from the form fields
//
// Every request needs `Authorization: Bearer <LC_PASSWORD>`.
//
// In production the file is committed to GitHub (which redeploys the site), so
// it needs GITHUB_TOKEN: a fine-grained token with read/write "Contents" on this
// repo only. GITHUB_REPO / GITHUB_BRANCH override the defaults below.
// The dev server sets LC_WRITE=local, so saves go straight to content/leetcode/.
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CONTENT_DIR, STATUSES } from '../scripts/leetcode/lib.mjs'

const REPO = process.env.GITHUB_REPO || 'actuallycedric/portfolio-v3'
const BRANCH = process.env.GITHUB_BRANCH || 'main'
const local = () => process.env.LC_WRITE === 'local'

let slugs
const knownSlug = (slug) => {
  slugs ??= new Set(JSON.parse(readFileSync(new URL('../data/neetcode150.json', import.meta.url), 'utf8')).map((p) => p.slug))
  return slugs.has(slug)
}

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const sha256 = (s) => createHash('sha256').update(s).digest()

// null when allowed, otherwise the response to send
async function guard(request) {
  const expected = process.env.LC_PASSWORD
  if (!expected) return json({ error: 'editor not set up: LC_PASSWORD is missing' }, 503)
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (timingSafeEqual(sha256(given), sha256(expected))) return null
  // no rate limiting on serverless, so at least make guessing slow
  await new Promise((r) => setTimeout(r, 800))
  return json({ error: 'wrong password' }, 401)
}

// ---------- storage: github in production, the local folder in dev ----------
const repoPath = (slug) => `content/leetcode/${slug}.md`

async function github(path, init = {}) {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN is missing')
  return fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'portfolio-lc-editor',
      ...init.headers,
    },
  })
}

async function readSolution(slug) {
  if (local()) {
    const content = await readFile(join(CONTENT_DIR, `${slug}.md`), 'utf8').catch(() => null)
    return content === null ? { exists: false } : { exists: true, content, sha: sha256(content).toString('hex') }
  }
  const res = await github(`${repoPath(slug)}?ref=${BRANCH}`)
  if (res.status === 404) return { exists: false }
  if (!res.ok) throw new Error(`github read failed: ${res.status}`)
  const file = await res.json()
  return { exists: true, content: Buffer.from(file.content, 'base64').toString('utf8'), sha: file.sha }
}

class Conflict extends Error {}

async function writeSolution(slug, content, sha, created) {
  if (local()) {
    const current = await readSolution(slug)
    if ((current.sha ?? null) !== (sha ?? null)) throw new Conflict()
    await mkdir(CONTENT_DIR, { recursive: true })
    await writeFile(join(CONTENT_DIR, `${slug}.md`), content)
    return { sha: sha256(content).toString('hex'), where: `content/leetcode/${slug}.md` }
  }
  const res = await github(repoPath(slug), {
    method: 'PUT',
    body: JSON.stringify({
      message: `lc: ${created ? 'add' : 'update'} ${slug}`,
      content: Buffer.from(content).toString('base64'),
      branch: BRANCH,
      ...(sha && { sha }),
    }),
  })
  // 409 = sha is stale; 422 = file exists but no sha was sent
  if (res.status === 409 || res.status === 422) throw new Conflict()
  if (!res.ok) throw new Error(`github write failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { sha: data.content.sha, commit: data.commit.html_url }
}

// ---------- markdown ----------
// frontmatter values are single `key: value` lines, so no newlines, and the
// parser treats " #" as a comment
const oneLine = (v, max = 60) =>
  String(v ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s#/g, ' ')
    .trim()
    .slice(0, max)

function toMarkdown(f) {
  const lang = oneLine(f.lang, 20) || 'python'
  const code = String(f.code ?? '').replace(/\r\n/g, '\n').replace(/\n+$/, '')
  // a fence longer than any backtick run inside the code
  const fence = '`'.repeat(Math.max(3, ...[...code.matchAll(/`+/g)].map((m) => m[0].length + 1)))
  const block = (s) => String(s ?? '').replace(/\r\n/g, '\n').trim()
  return `---
slug: ${f.slug}
status: ${f.status}   # solved | attempted | review
date: ${f.date}
time: ${oneLine(f.time)}
space: ${oneLine(f.space)}
lang: ${lang}
---
## Approach
${block(f.approach)}

## Code

${fence}${lang}
${code}
${fence}

## Notes
${block(f.notes)}
${block(f.extra) ? `\n${block(f.extra)}\n` : ''}`
}

// ---------- handlers ----------
export async function GET(request) {
  const denied = await guard(request)
  if (denied) return denied
  const slug = new URL(request.url).searchParams.get('slug')
  if (!slug) return json({ ok: true, mode: local() ? 'local' : 'github' })
  if (!knownSlug(slug)) return json({ error: `"${slug}" isn't in the neetcode 150` }, 400)
  try {
    return json(await readSolution(slug))
  } catch (err) {
    console.error(err)
    return json({ error: err.message }, 502)
  }
}

export async function PUT(request) {
  const denied = await guard(request)
  if (denied) return denied

  const text = await request.text()
  if (text.length > 200_000) return json({ error: 'too big' }, 413)
  let f
  try {
    f = JSON.parse(text)
  } catch {
    return json({ error: 'body must be json' }, 400)
  }

  const errors = []
  if (!knownSlug(f.slug)) errors.push(`"${f.slug}" isn't in the neetcode 150`)
  if (!STATUSES.includes(f.status)) errors.push(`status must be one of ${STATUSES.join(' | ')}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date ?? '')) errors.push('date must be YYYY-MM-DD')
  if (errors.length) return json({ error: errors.join('; ') }, 400)

  try {
    const saved = await writeSolution(f.slug, toMarkdown(f), f.sha || null, !f.sha)
    return json({ ok: true, mode: local() ? 'local' : 'github', ...saved })
  } catch (err) {
    if (err instanceof Conflict) {
      return json({ error: 'the file changed since you opened it. reload the problem and try again' }, 409)
    }
    console.error(err)
    return json({ error: err.message }, 502)
  }
}
