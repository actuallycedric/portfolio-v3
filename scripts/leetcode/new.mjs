// npm run lc <slug>: create content/leetcode/<slug>.md from the template.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CONTENT_DIR, ROOT, loadCatalog } from './lib.mjs'

const fail = (msg) => {
  console.error(msg)
  process.exit(1)
}

const slug = (process.argv[2] ?? '').trim().toLowerCase()
if (!slug) fail('usage: npm run lc <slug>   e.g. npm run lc two-sum')

const catalog = loadCatalog()
const entry = catalog.find((p) => p.slug === slug)

if (!entry) {
  // closest matches: substring hits first, then smallest edit distance
  const distance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]
      row[0] = i
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j]
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
        prev = tmp
      }
    }
    return row[b.length]
  }
  const ranked = catalog
    .map((p) => ({ slug: p.slug, score: p.slug.includes(slug) ? -1 : distance(slug, p.slug) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
  fail(`"${slug}" isn't in the neetcode 150. did you mean:\n${ranked.map((r) => `  ${r.slug}`).join('\n')}`)
}

const file = join(CONTENT_DIR, `${slug}.md`)
if (existsSync(file)) fail(`${relative(ROOT, file)} already exists`)

const d = new Date()
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const template = `---
slug: ${slug}
status: attempted   # solved | attempted | review
date: ${today}
time:
space:
lang: python
---
## Approach


## Code

\`\`\`python

\`\`\`

## Notes

`

mkdirSync(CONTENT_DIR, { recursive: true })
writeFileSync(file, template)
console.log(relative(ROOT, file))
