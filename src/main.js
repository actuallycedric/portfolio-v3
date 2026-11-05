// Light/dark toggle: flips whatever is showing now (saved choice or system
// default) and remembers the choice.
const root = document.documentElement
const systemDark = matchMedia('(prefers-color-scheme: dark)')

document.querySelector('.theme-toggle').addEventListener('click', () => {
  const current = root.dataset.theme ?? (systemDark.matches ? 'dark' : 'light')
  const next = current === 'dark' ? 'light' : 'dark'
  root.dataset.theme = next
  try {
    localStorage.setItem('theme', next)
  } catch {}
})

// Email row: copy the address and flash "copied" in place of "copy".
// navigator.clipboard only exists on https/localhost, so fall back to the
// old execCommand trick when the page is served over plain http (e.g. the
// tailscale dev url).
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'))
}

document.querySelectorAll('.copy-email').forEach((button) => {
  const hint = button.querySelector('.copy-hint')
  let timer
  button.addEventListener('click', () => {
    copyText(button.dataset.email)
      .then(() => {
        hint.textContent = 'copied'
        button.classList.add('copied')
      })
      .catch(() => {
        hint.textContent = button.dataset.email
      })
      .finally(() => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          hint.textContent = 'copy'
          button.classList.remove('copied')
        }, 1800)
      })
  })
})

// Place marquees: duplicate each list once (hidden from screen readers) so
// shifting the track by half loops seamlessly.
document.querySelectorAll('.places-track').forEach((track) => {
  for (const li of [...track.children]) {
    const copy = li.cloneNode(true)
    copy.setAttribute('aria-hidden', 'true')
    track.append(copy)
  }
})
