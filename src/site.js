/* John Lum Architecture: slideshow, masonry, image orientation, search. No dependencies.
   Every photo box is 4:3 or 3:4. Boxes marked data-orient="auto" take the photo's own orientation once it loads. */
(() => {
  const J = window.JLA || { root: '', preview: false };
  const link = u => /^https?:\/\//.test(u) ? u : J.root + u + (J.preview ? 'index.html' : '');
  const asset = s => !s ? '' : /^https?:\/\//.test(s) ? s : J.root + s;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- images: fade in on load, hide if broken, settle orientation ---------- */
  const settle = im => {
    if (!im.naturalWidth) { im.classList.add('is-broken'); return; }
    im.classList.add('is-loaded');
    const box = im.closest('[data-orient="auto"]');
    if (box && !im.classList.contains('card-hover')) {
      box.dataset.orient = im.naturalHeight > im.naturalWidth * 1.02 ? 'portrait' : 'landscape';
      box.dispatchEvent(new CustomEvent('orient', { bubbles: true }));
    }
  };
  document.querySelectorAll('img').forEach(im => { if (im.complete && im.src) settle(im); });
  document.addEventListener('load', e => { if (e.target.tagName === 'IMG') settle(e.target); }, true);
  document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.classList.add('is-broken'); }, true);

  /* ---------- home slideshow: transform track, eased motion, loops ---------- */
  function slideshow(root) {
    const track = root.querySelector('.slides');
    const cap = root.querySelector('.slide-caption');
    const orig = [...track.children];
    const n = orig.length;
    if (!n) return;
    const clone = li => { const c = li.cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.querySelectorAll('a').forEach(a => a.tabIndex = -1); return c; };
    track.prepend(...orig.map(clone));
    track.append(...orig.map(clone));
    const all = [...track.children];

    const TAU = reduce ? 1 : 120;             // ms; lower is snappier
    let centers = [], span = 0, W = 0;
    let pos = 0, target = 0, raf = 0, last = 0;
    let dragging = false, moved = false, active = -1;

    const measure = () => {
      W = root.clientWidth;
      centers = all.map(li => li.offsetLeft + li.offsetWidth / 2);
      span = all[n].offsetLeft - all[0].offsetLeft;
    };
    const nearest = x => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < centers.length; i++) { const d = Math.abs(centers[i] - x); if (d < bd) { bd = d; best = i; } }
      return best;
    };
    const at = i => centers[Math.max(0, Math.min(centers.length - 1, i))];
    const normalize = () => {                 // keep the view inside the middle set; the jump is invisible
      const lo = centers[n] - span / 2;
      if (pos < lo) { pos += span; target += span; }
      else if (pos >= lo + span) { pos -= span; target -= span; }
    };
    const render = () => { track.style.transform = `translate3d(${(W / 2 - pos).toFixed(2)}px,0,0)`; };
    const caption = () => {
      const i = nearest(pos) % n;
      if (i === active) return;
      const first = active < 0;
      active = i;
      const a = orig[i].querySelector('a');
      const swap = () => { cap.innerHTML = `<a href="${a.getAttribute('href')}">${a.dataset.title}</a>`; cap.classList.remove('is-changing'); };
      if (first || reduce) return swap();
      cap.classList.add('is-changing');
      clearTimeout(caption.t); caption.t = setTimeout(swap, 220);
    };
    const tick = t => {
      const dt = last ? Math.min(64, t - last) : 16;
      last = t;
      if (!dragging) {
        pos += (target - pos) * (1 - Math.exp(-dt / TAU));
        if (Math.abs(target - pos) < .25) pos = target;
      }
      normalize(); render(); caption();
      if (dragging || pos !== target) raf = requestAnimationFrame(tick);
      else { raf = 0; last = 0; }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const goTo = i => { target = at(i); kick(); };

    // wheel: a mouse notch moves one slide, a trackpad glides and then settles on the nearest slide
    let lock = 0, idle = 0;
    root.addEventListener('wheel', e => {
      const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const d = (horiz ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 40 : 1);
      if (!d) return;
      e.preventDefault();
      const notch = e.deltaMode === 1 || (!horiz && Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && Number.isInteger(e.deltaY));
      if (notch) {
        if (e.timeStamp < lock) return;
        lock = e.timeStamp + 420;
        goTo(nearest(target) + Math.sign(d));
      } else {
        target += d;
        clearTimeout(idle);
        idle = setTimeout(() => goTo(nearest(target)), 140);
        kick();
      }
    }, { passive: false });

    // drag and swipe, with flick momentum
    let startX = 0, startPos = 0, samples = [];
    root.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      dragging = true; moved = false;
      startX = e.clientX; startPos = pos; target = pos;
      samples = [[e.clientX, e.timeStamp]];
      kick();
    });
    root.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 6) { moved = true; root.classList.add('is-dragging'); root.setPointerCapture(e.pointerId); }
      if (!moved) return;
      pos = target = startPos - dx;
      samples.push([e.clientX, e.timeStamp]);
      while (samples.length > 2 && e.timeStamp - samples[0][1] > 90) samples.shift();
    });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        const [x0, t0] = samples[0], [x1, t1] = samples[samples.length - 1];
        const v = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;     // px per ms
        goTo(nearest(pos - v * 260));
        requestAnimationFrame(() => root.classList.remove('is-dragging'));
      } else goTo(nearest(pos));
    };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    root.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    root.addEventListener('dragstart', e => e.preventDefault());

    document.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); goTo(nearest(target) + (e.key === 'ArrowRight' ? 1 : -1)); }
    });
    root.addEventListener('focusin', e => { const li = e.target.closest('.slide'); if (li) { root.scrollLeft = 0; goTo(all.indexOf(li)); } });

    const recenter = () => { const i = active < 0 ? 0 : active; measure(); pos = target = centers[n + i]; render(); };
    root.addEventListener('orient', recenter);
    new ResizeObserver(recenter).observe(root);
    measure();
    pos = target = centers[n];
    render(); caption();
    requestAnimationFrame(() => root.classList.add('is-ready'));
  }

  /* ---------- works: shortest-column masonry, keeps reading order ---------- */
  function masonry(el) {
    const cards = [...el.querySelectorAll('.card')];
    let cols = 0;
    const layout = force => {
      const w = el.clientWidth;
      const n = w >= 820 ? 3 : w >= 500 ? 2 : 1;
      if (n === cols && !force) return;
      cols = n;
      const colEls = Array.from({ length: n }, () => Object.assign(document.createElement('div'), { className: 'masonry-col' }));
      const h = new Array(n).fill(0);
      for (const c of cards) {
        const k = h.indexOf(Math.min(...h));
        colEls[k].append(c);
        h[k] += (c.dataset.orient === 'portrait' ? 4 / 3 : 3 / 4) + .12;
      }
      el.replaceChildren(...colEls);
      el.classList.add('is-ready');
    };
    layout();
    new ResizeObserver(() => layout()).observe(el);
    // photos whose orientation was unknown at build time: rebalance once if it happens before the visitor scrolls
    el.addEventListener('orient', () => { if (scrollY < 40) { clearTimeout(layout.t); layout.t = setTimeout(() => layout(true), 120); } });
  }

  /* ---------- project photos: enlarge in place over a shaded, blurred page ---------- */
  function lightbox() {
    const items = [...document.querySelectorAll('.project .zoom')];
    if (!items.length) return;
    const root = document.createElement('div');
    root.className = 'lb'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Enlarged photo');
    root.innerHTML = '<div class="lb-shade"></div><img class="lb-img" alt=""><button type="button" class="lb-close sr-only">Close photo</button>';
    document.body.append(root);
    const shade = root.querySelector('.lb-shade'), im = root.querySelector('.lb-img'), closeB = root.querySelector('.lb-close');
    const DUR = reduce ? 1 : 560, EASE = 'cubic-bezier(.22, 1, .36, 1)';
    let cur = -1, busy = false, rect = null;

    const thumb = n => items[n].querySelector('img');
    const size = n => {
      const b = items[n], t = thumb(n);
      return [+b.dataset.w || t.naturalWidth || 4, +b.dataset.h || t.naturalHeight || 3];
    };
    // the whole, uncropped photo, as large as the window allows
    const fitRect = n => {
      const [w, h] = size(n), m = Math.max(16, Math.min(innerWidth, innerHeight) * .04);
      const k = Math.min((innerWidth - 2 * m) / w, (innerHeight - 2 * m) / h);
      return { x: (innerWidth - w * k) / 2, y: (innerHeight - h * k) / 2, w: w * k, h: h * k };
    };
    const place = r => Object.assign(im.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    // transform + clip that make the full-size photo look exactly like its cropped thumbnail
    const fromThumb = (t, r) => {
      const k = Math.max(t.width / r.w, t.height / r.h), vw = t.width / k, vh = t.height / k;
      const ix = (r.w - vw) / 2, iy = (r.h - vh) / 2;
      return { transform: `translate(${t.left - r.x - ix * k}px, ${t.top - r.y - iy * k}px) scale(${k})`, clipPath: `inset(${iy}px ${ix}px ${iy}px ${ix}px)` };
    };
    const lock = on => {
      const de = document.documentElement;
      if (on) { const sb = innerWidth - de.clientWidth; de.classList.add('lb-open'); if (sb > 0) { document.body.style.paddingRight = sb + 'px'; document.querySelector('.site-header').style.paddingRight = `calc(var(--gutter) + ${sb}px)`; } }
      else { de.classList.remove('lb-open'); document.body.style.paddingRight = ''; document.querySelector('.site-header').style.paddingRight = ''; }
    };
    const onScreen = t => t.bottom > 0 && t.top < innerHeight && t.right > 0 && t.left < innerWidth;
    const loadFull = n => {
      const full = new Image();
      full.src = items[n].dataset.full;
      full.decode().then(() => { if (cur === n) im.src = full.src; }).catch(() => {});
    };

    const open = n => {
      if (busy || !root.hidden) return;
      busy = true; cur = n;
      const t = thumb(n), tr = t.getBoundingClientRect();
      im.src = t.currentSrc || t.src; im.alt = t.alt;
      rect = fitRect(n); place(rect);
      lock(true); root.hidden = false;
      t.style.visibility = 'hidden';
      const start = fromThumb(tr, rect);
      im.animate([start, { transform: 'none', clipPath: 'inset(0px 0px 0px 0px)' }], { duration: DUR, easing: EASE });
      shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR * .8, easing: 'ease-out', fill: 'both' })
        .finished.then(() => { busy = false; });
      loadFull(n);
      closeB.focus({ preventScroll: true });
    };

    const close = () => {
      if (busy || root.hidden) return;
      busy = true;
      const t = thumb(cur), tr = t.getBoundingClientRect();
      const anim = onScreen(tr)
        ? im.animate([{ transform: 'none', clipPath: 'inset(0px 0px 0px 0px)' }, fromThumb(tr, rect)], { duration: DUR * .85, easing: EASE, fill: 'forwards' })
        : im.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: DUR * .6, easing: EASE, fill: 'forwards' });
      shade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR * .7, easing: 'ease-in', fill: 'forwards' });
      anim.finished.then(() => {
        t.style.visibility = '';
        root.hidden = true; lock(false);
        im.getAnimations().forEach(a => a.cancel()); shade.getAnimations().forEach(a => a.cancel());
        im.removeAttribute('src');
        items[cur].focus({ preventScroll: true });
        busy = false;
      });
    };

    // next / previous photo while enlarged: arrow keys or a sideways swipe
    const go = d => {
      if (busy || root.hidden) return;
      busy = true;
      const n = (cur + d + items.length) % items.length;
      im.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-d * 24}px)` }], { duration: 180, easing: 'ease-in', fill: 'forwards' })
        .finished.then(() => {
          thumb(cur).style.visibility = '';
          cur = n; const t = thumb(n);
          t.style.visibility = 'hidden';
          im.getAnimations().forEach(a => a.cancel());
          im.src = t.currentSrc || t.src; im.alt = t.alt;
          rect = fitRect(n); place(rect);
          loadFull(n);
          return im.animate([{ opacity: 0, transform: `translateX(${d * 24}px)` }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE }).finished;
        })
        .then(() => { busy = false; });
    };

    items.forEach((b, n) => b.addEventListener('click', () => open(n)));
    let swiped = false;
    shade.addEventListener('click', () => { if (swiped) { swiped = false; return; } close(); });
    closeB.addEventListener('click', close);
    document.addEventListener('keydown', e => {
      if (root.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Tab') { e.preventDefault(); closeB.focus(); }
    });
    root.addEventListener('wheel', e => { e.preventDefault(); if (Math.abs(e.deltaY) > 8) close(); }, { passive: false });
    let sx = null, sy = 0;
    root.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
    root.addEventListener('pointerup', e => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      swiped = Math.hypot(dx, dy) > 10;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
      else if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx)) close();      // swipe up or down to dismiss on phones
    });
    addEventListener('resize', () => { if (!root.hidden && !busy) { rect = fitRect(cur); place(rect); } });
  }

  /* ---------- search ---------- */
  function search(root) {
    const btn = root.querySelector('.search-toggle');
    const form = root.querySelector('.search-form');
    const input = root.querySelector('input');
    const panel = root.querySelector('.search-results');
    const list = panel.querySelector('ul');
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const idx = (window.JLA_INDEX || []).map(x => ({ ...x, n: norm(x.t + ' ' + (x.s || '')), tn: norm(x.t) }));
    const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let results = [];

    const open = () => { root.classList.add('is-open'); form.hidden = false; btn.setAttribute('aria-expanded', 'true'); input.focus(); };
    const close = () => { root.classList.remove('is-open'); form.hidden = true; panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); input.value = ''; };
    const render = () => {
      const q = norm(input.value.trim());
      if (!q) { panel.hidden = true; return; }
      const terms = q.split(/\s+/);
      const weight = { Project: 3, Page: 2 };
      results = idx.filter(x => terms.every(t => x.n.includes(t)))
        .map(x => ({ x, s: (x.tn.startsWith(q) ? 6 : x.tn.includes(q) ? 4 : 0) + (weight[x.k] || 1) }))
        .sort((a, b) => b.s - a.s).slice(0, 8).map(r => r.x);
      list.innerHTML = results.length
        ? results.map(r => `<li><a href="${esc(link(r.u))}"${r.x ? ' target="_blank" rel="noopener"' : ''}><span class="r-thumb">${r.i ? `<img src="${esc(asset(r.i))}" alt="" loading="lazy">` : ''}</span><span class="r-title">${esc(r.t)}</span><span class="r-kind">${esc(r.k)}</span></a></li>`).join('')
        : `<li class="r-empty">Nothing found for “${esc(input.value.trim())}”</li>`;
      panel.hidden = false;
    };
    btn.addEventListener('click', open);
    input.addEventListener('input', render);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const r = results[0];
      if (r) r.x ? window.open(link(r.u), '_blank', 'noopener') : (location.href = link(r.u));
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('is-open')) { close(); btn.focus(); } });
    document.addEventListener('pointerdown', e => { if (root.classList.contains('is-open') && !root.contains(e.target)) close(); });
  }

  document.querySelectorAll('[data-slideshow]').forEach(slideshow);
  document.querySelectorAll('[data-masonry]').forEach(masonry);
  document.querySelectorAll('[data-search]').forEach(search);
  lightbox();
})();
