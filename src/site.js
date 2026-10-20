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
      if (!horiz) return;                       // up/down scrolls the page to the studio statement
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
    const tri = d => `<svg viewBox="0 0 11 13" aria-hidden="true"><path d="${d}"/></svg>`;
    root.innerHTML = '<div class="lb-shade"></div><img class="lb-img" alt="">'
      + `<button type="button" class="lb-nav lb-prev" aria-label="Previous photo">${tri('M0 6.5 11 0v13z')}</button>`
      + `<button type="button" class="lb-nav lb-next" aria-label="Next photo">${tri('M11 6.5 0 13V0z')}</button>`
      + '<button type="button" class="lb-close sr-only">Close photo</button>';
    document.body.append(root);
    const shade = root.querySelector('.lb-shade'), im = root.querySelector('.lb-img'), closeB = root.querySelector('.lb-close');
    const navs = [...root.querySelectorAll('.lb-nav')];
    if (items.length < 2) navs.forEach(b => b.hidden = true);
    const fade = (on, ms) => [shade, ...navs].map(e => e.animate([{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], { duration: ms, easing: on ? 'ease-out' : 'ease-in', fill: on ? 'both' : 'forwards' }));
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
      const phone = innerWidth < 640, many = items.length > 1;
      const mx = !phone && many ? Math.max(m, 76) : m, top = m, bottom = phone && many ? 76 : m;
      const k = Math.min((innerWidth - 2 * mx) / w, (innerHeight - top - bottom) / h);
      return { x: (innerWidth - w * k) / 2, y: top + (innerHeight - top - bottom - h * k) / 2, w: w * k, h: h * k };
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
      fade(true, DUR * .8)[0].finished.then(() => { busy = false; });
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
      fade(false, DUR * .7);
      anim.finished.then(() => {
        t.style.visibility = '';
        root.hidden = true; lock(false);
        [im, shade, ...navs].forEach(e => e.getAnimations().forEach(a => a.cancel()));
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
    navs[0].addEventListener('click', () => go(-1));
    navs[1].addEventListener('click', () => go(1));
    document.addEventListener('keydown', e => {
      if (root.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Tab') {                       // focus stays on the enlarged photo's controls
        e.preventDefault();
        const f = [...root.querySelectorAll('button:not([hidden])')];
        f[(f.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
    root.addEventListener('wheel', e => { e.preventDefault(); if (Math.abs(e.deltaY) > 8) close(); }, { passive: false });
    let sx = null, sy = 0;
    root.addEventListener('pointerdown', e => { if (e.target.closest('.lb-nav')) { sx = null; return; } sx = e.clientX; sy = e.clientY; });
    root.addEventListener('pointerup', e => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      swiped = Math.hypot(dx, dy) > 10;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
      else if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx)) close();      // swipe up or down to dismiss on phones
    });
    addEventListener('resize', () => { if (!root.hidden && !busy) { rect = fitRect(cur); place(rect); } });
  }

  /* ---------- weighted scrolling (desktop mouse and trackpad) ----------
     The wheel sets a target and the page eases toward it, so scrolling carries a little momentum.
     Keyboard, scrollbar, touch and anything that scrolls on its own keep native behaviour. */
  function smoothScroll() {
    if (reduce || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const de = document.documentElement;
    let target = scrollY, cur = scrollY, raf = 0, moving = false;
    const max = () => de.scrollHeight - innerHeight;
    const tick = () => {
      cur += (target - cur) * .11;
      if (Math.abs(target - cur) < .4) { cur = target; moving = false; raf = 0; }
      scrollTo(0, cur);
      if (moving) raf = requestAnimationFrame(tick);
    };
    const scrollsItself = el => {
      for (let n = el; n && n !== document.body && n !== de; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return true;
      }
      return false;
    };
    addEventListener('wheel', e => {
      if (e.defaultPrevented || e.ctrlKey || de.classList.contains('lb-open') || de.classList.contains('sp-open') || Math.abs(e.deltaX) > Math.abs(e.deltaY) || scrollsItself(e.target)) return;
      e.preventDefault();
      if (!moving) target = cur = scrollY;
      const d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
      target = Math.max(0, Math.min(max(), target + d));
      moving = true;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: false });
    addEventListener('scroll', () => { if (!moving) target = cur = scrollY; }, { passive: true });
    // in-page links (Information, Photos) glide there too
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      const el = a && document.getElementById(a.getAttribute('href').slice(1));
      if (!el) return;
      e.preventDefault();
      const off = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      target = Math.max(0, Math.min(max(), el.getBoundingClientRect().top + scrollY - off));
      if (!moving) cur = scrollY;
      moving = true;
      if (!raf) raf = requestAnimationFrame(tick);
      history.replaceState(null, '', '#' + el.id);
    });
  }

  /* ---------- reveal: what starts below the fold rises into place when it arrives ---------- */
  function reveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    const els = [...document.querySelectorAll('.card, .gallery-row figure, .press-grid > li, .people-grid > li, .statement > *, .p-intro, .p-more-head, .phase')];
    const io = new IntersectionObserver(entries => {
      let n = 0;
      entries.filter(en => en.isIntersecting).sort((a, b) => a.boundingClientRect.left - b.boundingClientRect.left).forEach(en => {
        en.target.style.setProperty('--rv-delay', `${Math.min(n++, 4) * 90}ms`);
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .01 });
    els.forEach(el => {
      if (el.getBoundingClientRect().top < innerHeight * .92) return;   // already on screen: leave it alone
      el.classList.add('rv');
      io.observe(el);
    });
  }

  /* ---------- project page: the hero recedes as the sheet covers it; the bar gains a rule once it sticks ---------- */
  function projectScroll() {
    const hero = document.querySelector('[data-hero]');
    const bar = document.querySelector('.p-bar');
    if (!hero || !bar) return;
    const heroImg = hero.querySelector('img');
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = hero.offsetHeight || 1;
      const p = Math.min(1, Math.max(0, scrollY / h));
      if (!reduce && heroImg) { heroImg.style.transform = `scale(${(1 + p * .06).toFixed(4)})`; heroImg.style.opacity = (1 - p * .35).toFixed(3); }
      bar.classList.toggle('is-stuck', bar.getBoundingClientRect().top <= parseFloat(getComputedStyle(bar).top) + .5 && scrollY > 4);
    };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* ---------- search: a panel that slides down from under the header ---------- */
  function search(panel) {
    const toggle = document.querySelector('.search-toggle');
    const input = panel.querySelector('.sp-input');
    const out = panel.querySelector('.sp-results');
    const shade = panel.querySelector('.sp-shade');
    const de = document.documentElement;
    const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const idx = (window.JLA_INDEX || []).map(x => ({ ...x, n: norm(x.t + ' ' + (x.k || '') + ' ' + (x.s || '')), tn: norm(x.t) }));
    const GROUPS = [['p', 'Projects', 10], ['m', 'People', 5], ['r', 'Press', 5], ['a', 'Pages', 2]];
    let open = false, closing = 0;

    // bold the part of a title that matches what was typed
    const mark = (t, q) => {
      const i = q ? norm(t).indexOf(q) : -1;
      return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
    };
    const item = (r, q, n) => `<li style="--i:${n}"><a class="sp-item" href="${esc(link(r.u))}"${r.x ? ' target="_blank" rel="noopener"' : ''}>`
      + (r.i ? `<span class="sp-thumb"><img src="${esc(asset(r.i))}" alt="" loading="lazy" decoding="async" onload="this.classList.add('is-loaded')"></span>` : '')
      + `<span class="sp-title">${mark(r.t, q)}</span><span class="sp-meta">${esc(r.k || '')}${r.x ? ' ↗' : ''}</span></a></li>`;
    const group = (label, list, q, start, text) => `<section class="sp-group"><h2 class="sp-label">${label}</h2><ul class="sp-grid${text ? ' is-text' : ''}">${list.map((r, n) => item(r, q, start + n)).join('')}</ul></section>`;

    const render = () => {
      const raw = input.value.trim(), q = norm(raw);
      if (!q) {
        const sel = idx.filter(x => x.f).sort((a, b) => a.f - b.f).slice(0, 10);
        out.innerHTML = group('Selected projects', sel, '', 0) + '<p class="sp-hint">Type a project, a city, a collaborator or a publication. <kbd>↓</kbd> to move through results, <kbd>esc</kbd> to close.</p>';
        return;
      }
      const terms = q.split(/\s+/);
      const scored = idx.filter(x => terms.every(t => x.n.includes(t))).map(x => ({ x,
        s: (x.tn === q ? 20 : x.tn.startsWith(q) ? 12 : x.tn.split(/\s+/).some(w => w.startsWith(q)) ? 8 : x.tn.includes(q) ? 5 : 0) + (x.f ? 1 : 0) }))
        .sort((a, b) => b.s - a.s);
      let n = 0, html = '';
      for (const [g, label, max] of GROUPS) {
        const list = scored.filter(r => r.x.g === g).slice(0, max).map(r => r.x);
        if (list.length) { html += group(label, list, q, n, g === 'a'); n += list.length; }
      }
      out.innerHTML = html || `<p class="sp-empty">Nothing matches “${esc(raw)}”. Try a project name, a city such as Palo Alto, or a publication such as Dwell.</p>`;
    };

    const lock = on => {
      const sb = innerWidth - de.clientWidth;
      de.classList.toggle('sp-open', on);
      document.body.style.paddingRight = on && sb > 0 ? sb + 'px' : '';
      const h = document.querySelector('.site-header');
      if (h) h.style.paddingRight = on && sb > 0 ? `calc(var(--gutter) + ${sb}px)` : '';
    };
    const show = () => {
      if (open) return;
      clearTimeout(closing);
      open = true; panel.hidden = false; lock(true);
      toggle.setAttribute('aria-expanded', 'true');
      render();
      requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('is-open')));
      input.focus({ preventScroll: true });
    };
    const hide = () => {
      if (!open) return;
      open = false; panel.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      closing = setTimeout(() => { panel.hidden = true; lock(false); input.value = ''; }, reduce ? 0 : 560);
      toggle.focus({ preventScroll: true });
    };

    toggle.addEventListener('click', () => open ? hide() : show());
    shade.addEventListener('click', hide);
    input.addEventListener('input', render);
    panel.querySelector('.sp-form').addEventListener('submit', e => {
      e.preventDefault();
      const first = out.querySelector('.sp-item');
      if (first) first.click();
    });
    // keyboard: arrows move through results in reading order, esc closes, "/" opens from anywhere
    document.addEventListener('keydown', e => {
      if (!open) {
        if (e.key === '/' && !e.target.closest('input, textarea, [contenteditable]')) { e.preventDefault(); show(); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...out.querySelectorAll('.sp-item')];
      if (!items.length) return;
      e.preventDefault();
      const k = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') (items[k + 1] || items[0]).focus();
      else if (k <= 0) input.focus();
      else items[k - 1].focus();
    });
  }

  document.querySelectorAll('[data-slideshow]').forEach(slideshow);
  document.querySelectorAll('[data-masonry]').forEach(masonry);
  document.querySelectorAll('[data-search]').forEach(search);
  lightbox();
  smoothScroll();
  reveal();
  projectScroll();
})();
