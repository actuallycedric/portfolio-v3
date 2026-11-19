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
    // the photo nearest the middle is the featured one; the rest dim and shrink
    const middle = scroller.getBoundingClientRect().left + scroller.clientWidth / 2
    let current = null
    let best = Infinity
    for (const fig of scroller.querySelectorAll('figure')) {
      const r = fig.getBoundingClientRect()
      const off = Math.abs(r.left + r.width / 2 - middle)
      if (off < best) [best, current] = [off, fig]
    }
    for (const fig of scroller.querySelectorAll('figure')) fig.classList.toggle('current', fig === current)
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

// Skill web: each project row lists its skills in data-skills, so the links
// live next to the projects and the web just draws them. Pointing at (or
// tapping) a node lights it, its lines and the nodes on the other end.
document.querySelectorAll('.web').forEach((web) => {
  const svg = web.querySelector('.web-lines')
  const skills = new Map([...web.querySelectorAll('.skill')].map((el) => [el.dataset.skill, el]))
  const edges = []

  for (const hub of web.querySelectorAll('.hub')) {
    const row = document.getElementById(hub.dataset.project)
    if (!row) {
      console.warn(`skill web: no project row with id "${hub.dataset.project}"`)
      continue
    }
    for (const name of row.dataset.skills.split(/\s+/)) {
      const skill = skills.get(name)
      if (!skill) {
        console.warn(`skill web: "${hub.dataset.project}" lists unknown skill "${name}"`)
        continue
      }
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      svg.append(path)
      edges.push({ hub, skill, path })
    }
  }

  // screen readers get the links the lines show
  for (const [, skill] of skills) {
    const name = skill.querySelector('.label').textContent
    const used = edges.filter((e) => e.skill === skill).map((e) => e.hub.textContent)
    skill.setAttribute('aria-label', used.length ? `${name}, used in ${used.join(', ')}` : name)
  }

  // gently bowed lines read as hand-drawn rather than a wiring diagram
  const draw = () => {
    const box = web.getBoundingClientRect()
    const centre = (node) => {
      const r = node.querySelector('.dot').getBoundingClientRect()
      return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top]
    }
    for (const { hub, skill, path } of edges) {
      const [x1, y1] = centre(hub)
      const [x2, y2] = centre(skill)
      const bow = 0.12
      const cx = (x1 + x2) / 2 - (y2 - y1) * bow
      const cy = (y1 + y2) / 2 + (x2 - x1) * bow
      path.setAttribute('d', `M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`)
    }
  }

  let pinned = null
  const light = (node) => {
    const linked = edges.filter((e) => e.hub === node || e.skill === node)
    const lit = new Set([node, ...linked.flatMap((e) => [e.hub, e.skill])])
    web.classList.add('focusing')
    web.querySelectorAll('.node').forEach((n) => n.classList.toggle('lit', lit.has(n)))
    for (const e of edges) e.path.classList.toggle('lit', linked.includes(e))
  }
  const clear = () => {
    if (pinned) return light(pinned)
    web.classList.remove('focusing')
    web.querySelectorAll('.lit').forEach((el) => el.classList.remove('lit'))
  }

  // touch fires pointerover on press, so holding a node would light it; taps
  // go through the click handler below instead
  web.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return
    const node = e.target.closest('.node')
    if (node) light(node)
  })
  web.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return
    const node = e.target.closest('.node')
    if (node && !node.contains(e.relatedTarget)) clear()
  })
  web.addEventListener('focusin', (e) => {
    const node = e.target.closest('.node')
    if (node) light(node)
  })
  web.addEventListener('focusout', clear)

  // read from pointerdown because not every browser exposes pointerType on click
  let pointerType = ''
  web.addEventListener('pointerdown', (e) => { pointerType = e.pointerType })

  // touch has no hover, so a tap pins a node until you tap it again or elsewhere.
  // mouse users already get hover, so clicking a project hub does nothing for them
  for (const node of web.querySelectorAll('.node')) {
    node.addEventListener('click', () => {
      if (pointerType === 'mouse' && node.classList.contains('hub')) return
      pinned = pinned === node ? null : node
      if (pinned) light(pinned)
      else clear()
    })
  }
  document.addEventListener('click', (e) => {
    if (pinned && !web.contains(e.target)) {
      pinned = null
      clear()
    }
  })

  new ResizeObserver(draw).observe(web)
  draw()
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

// Highlighter: redraw every time the phrase comes back into view. it draws once
// clear of the bottom edge but only resets when fully off screen, so it never
// visibly snaps back while you can still see it.
const drawGlow = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add('drawn')
  },
  { rootMargin: '0px 0px -10% 0px' },
)
const resetGlow = new IntersectionObserver((entries) => {
  for (const entry of entries) if (!entry.isIntersecting) entry.target.classList.remove('drawn')
})
document.querySelectorAll('.glow').forEach((el) => {
  drawGlow.observe(el)
  resetGlow.observe(el)
})
