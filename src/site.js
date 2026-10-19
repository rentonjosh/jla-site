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

  /* ---------- project photo viewer: full frame on open, click to zoom to full resolution ---------- */
  function viewer(el) {
    const links = [...document.querySelectorAll('.project a.zoom')];
    if (!links.length) return;
    const stage = el.querySelector('.viewer-stage');
    const im = el.querySelector('.viewer-img');
    const count = el.querySelector('.viewer-count');
    const prevB = el.querySelector('.viewer-prev'), nextB = el.querySelector('.viewer-next'), closeB = el.querySelector('.viewer-close');
    let i = 0, natW = 0, natH = 0, fit = 1, scale = 1, x = 0, y = 0, zoomed = false, opener = null, token = 0;

    const sw = () => stage.clientWidth, sh = () => stage.clientHeight;
    const apply = anim => {
      im.classList.toggle('no-anim', !anim);
      im.style.width = natW + 'px'; im.style.height = natH + 'px';
      im.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${scale})`;
    };
    const clamp = () => {
      const w = natW * scale, h = natH * scale;
      x = w <= sw() ? (sw() - w) / 2 : Math.min(0, Math.max(sw() - w, x));
      y = h <= sh() ? (sh() - h) / 2 : Math.min(0, Math.max(sh() - h, y));
    };
    const fitView = anim => {
      fit = Math.min(sw() / natW, sh() / natH, 1.5);
      scale = fit; zoomed = false; stage.classList.remove('is-zoomed'); clamp(); apply(anim);
    };
    // zoom to full resolution (at least twice the fitted size), keeping the clicked point under the pointer
    const zoomAt = (px, py) => {
      const target = Math.max(1, fit * 2);
      if (target <= fit * 1.05) return;
      const r = stage.getBoundingClientRect(), cx = px - r.left, cy = py - r.top;
      x = cx - (cx - x) * (target / scale); y = cy - (cy - y) * (target / scale);
      scale = target; zoomed = true; stage.classList.add('is-zoomed'); clamp(); apply(true);
    };

    const show = n => {
      i = (n + links.length) % links.length;
      const a = links[i], my = ++token;
      count.textContent = `${i + 1} / ${links.length}`;
      prevB.disabled = nextB.disabled = links.length < 2;
      im.classList.remove('is-ready');
      im.alt = a.querySelector('img')?.alt || '';
      const pre = new Image();
      pre.onload = () => {
        if (my !== token) return;
        natW = pre.naturalWidth; natH = pre.naturalHeight;
        im.src = pre.src; fitView(false);
        requestAnimationFrame(() => im.classList.add('is-ready'));
        [links[(i + 1) % links.length], links[(i - 1 + links.length) % links.length]].forEach(l => { new Image().src = l.href; });
      };
      pre.onerror = () => { if (my === token) { count.textContent = `${i + 1} / ${links.length} · photo unavailable`; } };
      pre.src = a.href;
    };
    const open = n => {
      opener = document.activeElement;
      el.hidden = false; document.documentElement.classList.add('viewer-open');
      requestAnimationFrame(() => el.classList.add('is-open'));
      show(n); closeB.focus();
    };
    const close = () => {
      el.classList.remove('is-open'); document.documentElement.classList.remove('viewer-open');
      setTimeout(() => { el.hidden = true; im.removeAttribute('src'); im.classList.remove('is-ready'); }, reduce ? 0 : 350);
      opener?.focus?.();
    };

    links.forEach((a, n) => a.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;   // let "open in new tab" work
      e.preventDefault(); open(n);
    }));
    prevB.addEventListener('click', () => show(i - 1));
    nextB.addEventListener('click', () => show(i + 1));
    closeB.addEventListener('click', close);
    document.addEventListener('keydown', e => {
      if (el.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); zoomed ? fitView(true) : close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
      else if (e.key === 'Tab') {                       // keep focus inside the viewer
        const f = [...el.querySelectorAll('button:not([disabled])')];
        const k = f.indexOf(document.activeElement);
        if (e.shiftKey && k <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && k === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });

    // pointer: click toggles zoom; drag pans when zoomed; horizontal swipe changes photo when not zoomed
    let down = null, moved = false, pinch = null;
    const pts = new Map();
    stage.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      stage.setPointerCapture(e.pointerId);
      if (pts.size === 2) {
        const [[ax, ay], [bx, by]] = [...pts.values()];
        pinch = { d: Math.hypot(ax - bx, ay - by), s: scale, cx: (ax + bx) / 2, cy: (ay + by) / 2, x, y };
        down = null; return;
      }
      down = { x: e.clientX, y: e.clientY, ox: x, oy: y, t: e.timeStamp }; moved = false;
    });
    stage.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size === 2) {
        const [[ax, ay], [bx, by]] = [...pts.values()];
        const r = stage.getBoundingClientRect(), cx = pinch.cx - r.left, cy = pinch.cy - r.top;
        const ns = Math.min(Math.max(fit, pinch.s * Math.hypot(ax - bx, ay - by) / pinch.d), Math.max(1, fit * 4));
        x = cx - (cx - pinch.x) * (ns / pinch.s); y = cy - (cy - pinch.y) * (ns / pinch.s); scale = ns;
        zoomed = scale > fit * 1.02; stage.classList.toggle('is-zoomed', zoomed); clamp(); apply(false); return;
      }
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!moved && Math.hypot(dx, dy) > 6) { moved = true; if (zoomed) stage.classList.add('is-panning'); }
      if (moved && zoomed) { x = down.ox + dx; y = down.oy + dy; clamp(); apply(false); }
    });
    const end = e => {
      pts.delete(e.pointerId);
      if (pinch) { if (pts.size < 2) pinch = null; return; }
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      stage.classList.remove('is-panning');
      if (!moved) { zoomed ? fitView(true) : zoomAt(e.clientX, e.clientY); }
      else if (!zoomed && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(i + (dx < 0 ? 1 : -1));
      down = null;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', e => { pts.delete(e.pointerId); pinch = null; down = null; stage.classList.remove('is-panning'); });
    stage.addEventListener('wheel', e => {                  // trackpad pinch arrives as ctrl+wheel
      if (!e.ctrlKey && !zoomed) return;
      e.preventDefault();
      if (e.ctrlKey) {
        const r = stage.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
        const ns = Math.min(Math.max(fit, scale * Math.exp(-e.deltaY * .01)), Math.max(1, fit * 4));
        x = cx - (cx - x) * (ns / scale); y = cy - (cy - y) * (ns / scale); scale = ns;
        zoomed = scale > fit * 1.02; stage.classList.toggle('is-zoomed', zoomed);
      } else { x -= e.deltaX; y -= e.deltaY; }
      clamp(); apply(false);
    }, { passive: false });
    new ResizeObserver(() => { if (!el.hidden && natW) fitView(false); }).observe(stage);
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
  document.querySelectorAll('.viewer').forEach(viewer);
})();
