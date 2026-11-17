import './theme.js'

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

// Spotify (playing now, else last played): swap the fallback card's contents for the real
// track. Any failure (no env vars, spotify down) just leaves the fallback.
const lastPlayed = document.querySelector('#last-played')

if (lastPlayed) {
  fetch('/api/spotify')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
    .then((track) => {
      const cover = lastPlayed.querySelector('.vinyl-label')
      const link = lastPlayed.querySelector('.peek-title a')
      if (track.image) {
        cover.src = track.image
        cover.alt = `${track.album} album cover`
      }
      link.href = track.url
      link.textContent = track.title.toLowerCase()
      lastPlayed.querySelector('.peek-sub').textContent = track.artist.toLowerCase()
      lastPlayed.querySelector('.peek-label').textContent = track.isPlaying ? 'listening to' : 'last played'
    })
    .catch(() => {})
}

// Place marquees: duplicate each list once (hidden from screen readers) so
// shifting the track by half loops seamlessly.
document.querySelectorAll('.places-track').forEach((track) => {
  for (const li of [...track.children]) {
    const copy = li.cloneNode(true)
    copy.setAttribute('aria-hidden', 'true')
    track.append(copy)
  }
})

// Photo carousel: a native horizontal scroller. This adds the extras a plain
// overflow box lacks: prev/next buttons, a progress line, edge fades that only
// show where there's more to see, and click-and-drag for mouse users.
document.querySelectorAll('.gallery').forEach((gallery) => {
  const scroller = gallery.querySelector('.carousel')
  const thumb = gallery.querySelector('.carousel-progress span')
  const [prev, next] = gallery.querySelectorAll('.carousel-btn')
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const behavior = () => (reduceMotion.matches ? 'auto' : 'smooth')

  const update = () => {
    const max = scroller.scrollWidth - scroller.clientWidth
    const x = scroller.scrollLeft
    const atStart = x <= 1
    const atEnd = x >= max - 1
    scroller.classList.toggle('past-start', !atStart)
    scroller.classList.toggle('at-end', atEnd)
    prev.disabled = atStart
    next.disabled = atEnd
    // thumb width = visible share of the strip; offset slides it along the rest
    const share = scroller.clientWidth / scroller.scrollWidth
    const progress = max > 0 ? x / max : 0
    thumb.style.setProperty('--thumb', `${share * 100}%`)
    thumb.style.setProperty('--offset', `${progress * (1 / share - 1) * 100}%`)
  }

  // one step = the photos that fully fit, so nothing gets skipped
  const step = () => {
    const fig = scroller.querySelector('figure')
    const gap = parseFloat(getComputedStyle(fig.parentElement).columnGap) || 0
    const per = fig.offsetWidth + gap
    return Math.max(1, Math.floor((scroller.clientWidth + gap) / per)) * per
  }

  for (const button of [prev, next]) {
    button.addEventListener('click', () => {
      scroller.scrollBy({ left: Number(button.dataset.dir) * step(), behavior: behavior() })
    })
  }

  // arrow keys once the strip has focus
  scroller.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    scroller.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * step(), behavior: behavior() })
  })

  // mouse drag (touch and trackpads already scroll natively)
  let drag = null
  scroller.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    drag = { x: e.clientX, left: scroller.scrollLeft, moved: false }
    scroller.setPointerCapture(e.pointerId)
  })
  scroller.addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    if (!drag.moved && Math.abs(dx) < 4) return
    drag.moved = true
    scroller.classList.add('dragging')
    scroller.scrollLeft = drag.left - dx
  })
  const endDrag = () => {
    if (!drag) return
    const moved = drag.moved
    drag = null
    if (!moved) return
    // snapping is off mid-drag; glide to the nearest photo, then turn it back on
    const fig = scroller.querySelector('figure')
    const gap = parseFloat(getComputedStyle(fig.parentElement).columnGap) || 0
    const per = fig.offsetWidth + gap
    const target = Math.round(scroller.scrollLeft / per) * per
    scroller.scrollTo({ left: target, behavior: behavior() })
    const restore = () => scroller.classList.remove('dragging')
    // scrollend never fires if we're already on target, hence the timeout too
    scroller.addEventListener('scrollend', restore, { once: true })
    setTimeout(restore, 500)
  }
  scroller.addEventListener('pointerup', endDrag)
  scroller.addEventListener('pointercancel', endDrag)

  scroller.addEventListener('scroll', update, { passive: true })
  addEventListener('resize', update)
  // images are lazy, so the strip's width settles as they load
  scroller.querySelectorAll('img').forEach((img) => img.addEventListener('load', update))
  update()
})

// Scroll reveals: fade each .reveal block in the first time it comes into view.
const revealer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('in')
      revealer.unobserve(entry.target)
    }
  },
  { rootMargin: '0px 0px -10% 0px' },
)
document.querySelectorAll('.reveal').forEach((el) => revealer.observe(el))

// Dock: light up the tile for the section crossing the middle of the screen.
const tiles = new Map([...document.querySelectorAll('.dock [data-section]')].map((a) => [a.dataset.section, a]))

function setActive(id) {
  tiles.forEach((tile, key) => {
    const on = key === id
    tile.classList.toggle('active', on)
    if (on) tile.setAttribute('aria-current', 'true')
    else tile.removeAttribute('aria-current')
  })
}

const spy = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) setActive(entry.target.id)
    }
  },
  { rootMargin: '-45% 0px -50% 0px' },
)
tiles.forEach((_, id) => {
  const section = document.getElementById(id)
  if (section) spy.observe(section)
})
setActive('home')

// the last section is short, so it may never reach the middle: claim it at the bottom
addEventListener(
  'scroll',
  () => {
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) setActive('connect')
  },
  { passive: true },
)
