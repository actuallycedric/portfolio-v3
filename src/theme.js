// Light/dark toggle: flips whatever is showing now (saved choice or system
// default) and remembers the choice.
const root = document.documentElement
const systemDark = matchMedia('(prefers-color-scheme: dark)')

document.querySelector('.theme-toggle')?.addEventListener('click', () => {
  const current = root.dataset.theme ?? (systemDark.matches ? 'dark' : 'light')
  const next = current === 'dark' ? 'light' : 'dark'
  root.dataset.theme = next
  try {
    localStorage.setItem('theme', next)
  } catch {}
})
