// Fuzzy title match shared by the quick-jump search and the editor's picker.
// Lower is better; null = no match. Substring hits beat subsequence hits,
// earlier and word-start hits beat later ones.
export function score(lower, q) {
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
