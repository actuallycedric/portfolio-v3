// Footer year stays current without editing the html each january.
document.querySelectorAll('.year').forEach((el) => {
  el.textContent = new Date().getFullYear()
})

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

// Last played on spotify: swap the fallback card's contents for the real
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

// Subway line: connect the numbered section circles marked .station with a
// track, and fill it in as you scroll. A marker sits 60% of the way down the
// viewport; every bit of track above it is lit and every stop it has passed
// fills in, so scrolling back up empties the line again. Hitting the bottom of
// the page completes the route.
const subway = document.querySelector('.subway')
const stations = [...document.querySelectorAll('.station')]

if (subway && stations.length > 1) {
  const NS = 'http://www.w3.org/2000/svg'
  const MARKER = 0.6 // fraction of the viewport height
  const main = subway.parentElement
  let stops = [] // circle centres (y, relative to <main>)
  const sections = stations.map((s) => s.closest('.section'))
  // opt in to section-gated carousels only once this script is running, so
  // they still scroll if the js never loads
  main.classList.add('sections-tracked')

  const segments = stations.slice(1).map(() => {
    const track = document.createElementNS(NS, 'line')
    const lit = document.createElementNS(NS, 'line')
    track.classList.add('track')
    lit.classList.add('lit')
    subway.append(track, lit)
    return { track, lit, y1: 0, length: 0 }
  })

  // offsets relative to <main>, ignoring transforms (the sections' entrance
  // animation moves them, which would throw off getBoundingClientRect)
  function offsetIn(el) {
    let x = 0
    let y = 0
    for (let node = el; node && node !== main; node = node.offsetParent) {
      x += node.offsetLeft
      y += node.offsetTop
    }
    return { x, y }
  }

  function layout() {
    stops = stations.map((s) => offsetIn(s).y + s.offsetHeight / 2)
    segments.forEach((seg, i) => {
      const a = stations[i]
      const b = stations[i + 1]
      const pa = offsetIn(a)
      const x = pa.x + a.offsetWidth / 2
      seg.y1 = pa.y + a.offsetHeight
      const y2 = offsetIn(b).y
      seg.length = Math.max(0, y2 - seg.y1)
      for (const line of [seg.track, seg.lit]) {
        line.setAttribute('x1', x)
        line.setAttribute('x2', x)
        line.setAttribute('y1', seg.y1)
        line.setAttribute('y2', y2)
      }
      seg.lit.style.strokeDasharray = seg.length
    })
    update()
  }

  function update() {
    const mainTop = main.getBoundingClientRect().top
    let marker = innerHeight * MARKER - mainTop
    // the last stop is near the page bottom; on tall screens the marker would
    // run out of page before reaching it. if so, speed the marker up over the
    // final stretch of scrolling so it lands on the last stop exactly at the
    // bottom of the page.
    const maxScroll = document.documentElement.scrollHeight - innerHeight
    const markerAtBottom = innerHeight * MARKER - (mainTop + scrollY) + maxScroll
    const shortfall = stops[stops.length - 1] - markerAtBottom
    if (shortfall > 0) {
      const stretch = innerHeight * 0.5
      const progress = Math.min(Math.max(1 - (maxScroll - scrollY) / stretch, 0), 1)
      marker += shortfall * progress
    }
    segments.forEach((seg) => {
      const filled = Math.min(Math.max(marker - seg.y1, 0), seg.length)
      seg.lit.style.strokeDashoffset = seg.length - filled
    })
    // the section you're "on" is the last stop the marker has reached; its
    // carousels run, every other section's are paused (see .current in css)
    let current = -1
    stations.forEach((station, i) => {
      const reached = marker >= stops[i]
      station.classList.toggle('lit', reached)
      if (reached) current = i
    })
    sections.forEach((section, i) => {
      section?.classList.toggle('current', i === current)
    })
  }

  let queued = false
  addEventListener(
    'scroll',
    () => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        update()
      })
    },
    { passive: true },
  )

  layout()
  new ResizeObserver(layout).observe(main)
  document.fonts?.ready.then(layout)
}
