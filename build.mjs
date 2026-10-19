// JLA static site generator. No framework, no dependencies.
//   node build.mjs            -> dist/     clean URLs (works/golden-gate/), for any static host
//   node build.mjs --preview  -> preview/  explicit index.html links, opens straight from disk
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEMO = process.argv.includes('--demo');
const NOINDEX = process.argv.includes('--noindex');   // staging copies: keep them out of search results        // in-chat preview only: photos can't load there, so show a fixed orientation rhythm
const PREVIEW = DEMO || process.argv.includes('--preview');
const OUT = path.join(ROOT, DEMO ? 'preview-demo' : PREVIEW ? 'preview' : 'dist');
const UPLOADS = 'https://johnlumarchitecture.com/wp-content/uploads/';

const load = f => fs.readFile(path.join(ROOT, 'content', f), 'utf8').then(JSON.parse);
const [site, projects, press, people, services] = await Promise.all(
  ['site.json', 'projects.json', 'press.json', 'people.json', 'services.json'].map(load)
);

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// link from one page directory to another ('' is the site root)
const href = (from, to) => {
  const r = path.posix.relative('/' + from, '/' + to);
  const dir = r ? r + '/' : './';
  return PREVIEW ? dir + 'index.html' : dir;
};
const file = (from, f) => path.posix.relative('/' + from, '/' + f);
// image sources: absolute URL, local images/..., or a bare WordPress upload path (2020/05/x.jpg)
const src = (from, s) => !s ? '' : /^https?:\/\//.test(s) ? s : s.startsWith('images/') ? file(from, s) : UPLOADS + s;
const srcRoot = s => !s ? '' : /^https?:\/\//.test(s) || s.startsWith('images/') ? s : UPLOADS + s;
const thumbRoot = s => hasSmallLater(s) ? s.replace(/(\.\w+)$/, '-1200$1') : srcRoot(s);
const hasSmallLater = s => s && s.startsWith('images/') && existsSync(path.join(ROOT, s.replace(/(\.\w+)$/, '-1200$1')));
// local photos with a 1200px copy beside them (made by the importer) get a srcset, so grids and phones load the small one
const small = s => s && s.startsWith('images/') ? s.replace(/(\.\w+)$/, '-1200$1') : null;
const hasSmall = s => { const sm = small(s); return sm && existsSync(path.join(ROOT, sm)); };
const SIZES = {
  card: '(max-width: 560px) 100vw, (max-width: 860px) 50vw, 33vw',
  half: '(max-width: 560px) 100vw, 50vw',
  slide: '(max-width: 560px) 82vw, 70vw',
  full: '100vw',
  thumb: '(max-width: 560px) 50vw, 260px'
};
const img = (from, im, { alt = '', cls = '', lazy = true, priority = false, hidden = false, sizes = 'half' } = {}) => {
  if (!im) return '';
  const o = typeof im === 'string' ? { src: im } : im;
  if (!o.src) return '';
  const big = o.w && o.h ? Math.max(o.w, o.h) : 2400;
  const set = hasSmall(o.src) ? ` srcset="${esc(src(from, small(o.src)))} 1200w, ${esc(src(from, o.src))} ${big}w" sizes="${SIZES[sizes] || sizes}"` : '';
  const dims = o.w && o.h ? ` width="${o.w}" height="${o.h}"` : '';
  const c = [cls, hidden || cls.includes('card-img') ? '' : 'fade'].filter(Boolean).join(' ');
  return `<img${c ? ` class="${c}"` : ''} src="${esc(src(from, o.src))}" alt="${hidden ? '' : esc(o.alt ?? alt)}"${dims}${lazy ? ' loading="lazy"' : ''}${priority ? ' fetchpriority="high"' : ''} decoding="async"${set}${hidden ? ' aria-hidden="true"' : ''}>`;
};
// Every photo box is exactly 4:3 or 3:4. Orientation comes from an explicit "orientation" field, else the
// photo's recorded size, else the browser decides when the photo loads (data-orient="auto").
const orient = (im, demo) => {
  const o = im && typeof im === 'object' ? im : {};
  if (o.orientation === 'portrait' || o.orientation === 'landscape') return o.orientation;
  if (o.w && o.h) return o.h > o.w ? 'portrait' : 'landscape';
  return DEMO && demo ? demo : 'auto';
};
const box = (im, demo) => ` data-orient="${orient(im, demo)}"`;
const DEMO_GALLERY = ['portrait', 'portrait', 'portrait', 'landscape', 'landscape', 'portrait'];
const cats = site.categories;
const catPath = k => k === cats[0].key ? 'works' : `works/${k}`;
const catLabel = k => cats.find(c => c.key === k)?.label ?? k;

/* ---------- layout ---------- */
const pages = [];
const page = (p, title, section, body, opts = {}) => pages.push({ p, title, section, body, ...opts });

const layout = ({ p, title, section, body, description, bodyClass = '', image }) => {
  const nav = [['works', 'Works'], ['press', 'Press'], ['contact', 'Contact']]
    .map(([k, l]) => `<a href="${href(p, k)}"${section === k ? ' aria-current="page"' : ''}>${l}</a>`).join('');
  const logo = site.logo
    ? `<img src="${esc(file(p, site.logo))}" alt="" width="3063" height="848">`
    : `<span class="logo-type" aria-hidden="true">LUM</span>`;
  const full = title ? `${title} | ${site.name}` : site.name;
  const canonical = `${site.url}/${p ? p + '/' : ''}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description || site.description)}">
${NOINDEX ? '<meta name="robots" content="noindex, nofollow">\n' : ''}
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description || site.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${esc(/^https?:/.test(image) ? image : site.url + '/' + image)}">\n` : ''}<meta name="color-scheme" content="light">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap">
<link rel="stylesheet" href="${file(p, 'assets/styles.css')}">
<script>document.documentElement.classList.add('js')</script>
<link rel="icon" href="${file(p, 'assets/favicon.svg')}" type="image/svg+xml">
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="logo" href="${href(p, '')}" aria-label="${esc(site.name)}, home">${logo}</a>
  <a class="wordmark" href="${href(p, '')}">${esc(site.name)}</a>
  <nav class="site-nav" aria-label="Primary">
    ${nav}
    <div class="search" data-search>
      <button class="search-toggle" type="button" aria-expanded="false" aria-controls="search-results">Search</button>
      <form class="search-form" role="search" hidden>
        <svg class="search-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="9.5" cy="6.5" r="4.75"/><path d="M6.2 9.8 1.5 14.5"/></svg>
        <label class="sr-only" for="search-q">Search projects, press and people</label>
        <input id="search-q" type="search" autocomplete="off" spellcheck="false" placeholder="Search">
      </form>
      <div class="search-results" id="search-results" hidden><ul></ul></div>
    </div>
  </nav>
</header>
<main id="main">
${body}
</main>
${bodyClass.includes('is-home') ? '' : `<footer class="site-footer">
  <span>© ${new Date().getFullYear()} ${esc(site.name)}</span>
  <a href="${esc(site.instagram)}" target="_blank" rel="noopener">Instagram</a>
</footer>`}
<script>window.JLA={root:${JSON.stringify(file(p, '') ? file(p, '') + '/' : '')},preview:${PREVIEW}}</script>
<script src="${file(p, 'assets/search-index.js')}" defer></script>
<script src="${file(p, 'assets/site.js')}" defer></script>
</body>
</html>
`;
};

const tabs = (p, items, label, active = p) => `<nav class="tabs" aria-label="${esc(label)}">${items.map(([to, l]) =>
  `<a href="${href(p, to)}"${to === active ? ` aria-current="${to === p ? 'page' : 'true'}"` : ''}>${esc(l)}</a>`).join('')}</nav>`;
const head = (p, title, tabItems, tabLabel, level = 'h1', active = p) =>
  `<header class="page-head"><${level} class="page-title">${esc(title)}</${level}>${tabItems ? tabs(p, tabItems, tabLabel, active) : ''}</header>`;

/* ---------- home ---------- */
const featured = projects.filter(x => x.featured).sort((a, b) => a.featured - b.featured);
page('', '', 'home', `<h1 class="sr-only">${esc(site.name)}</h1>
<section class="slideshow" data-slideshow aria-roledescription="carousel" aria-label="Selected projects">
  <ul class="slides">
${featured.map((x, i) => {
    return `    <li class="slide"${box(x.homeImage || x.hero, 'landscape')}><a href="${href('', 'works/' + x.slug)}" data-title="${esc(x.title)}">${img('', x.homeImage || x.hero, { alt: x.title, lazy: false, priority: i === 0, sizes: 'slide' })}</a></li>`;
  }).join('\n')}
  </ul>
  <p class="slide-caption" aria-live="polite"><a href="${href('', 'works/' + featured[0].slug)}">${esc(featured[0].title)}</a></p>
</section>`, { bodyClass: 'is-home', image: srcRoot(featured[0].hero.src) });

/* ---------- works ---------- */
const workTabs = cats.map(c => [catPath(c.key), c.label]);
for (const c of cats) {
  const p = catPath(c.key);
  const list = projects.filter(x => x.category === c.key);
  page(p, c.key === cats[0].key ? 'Selected Works' : `${c.label} Works`, 'works', `${head(p, 'Selected Works', workTabs, 'Project categories')}
<div class="masonry" data-masonry>
${list.map((x, i) => {
    const hover = x.hover || null;
    const hero = x.heroAspect ? { ...x.hero, orientation: x.heroAspect < 1 ? 'portrait' : 'landscape' } : x.hero;
    return `  <a class="card${hover ? ' has-hover' : ''}" href="${href(p, 'works/' + x.slug)}"${box(hero, i % 4 === 1 ? 'portrait' : 'landscape')}>
    <span class="card-media">${img(p, x.hero, { alt: x.title, cls: 'card-img', lazy: i > 5, sizes: 'card' })}${hover ? img(p, hover, { cls: 'card-img card-hover', hidden: true, sizes: 'card' }) : ''}</span>
    <span class="card-title">${esc(x.title)}</span>
  </a>`;
  }).join('\n')}
</div>`, { description: `${c.label} projects by ${site.name}.` });
}

/* ---------- project pages ---------- */
const byCat = Object.fromEntries(cats.map(c => [c.key, projects.filter(x => x.category === c.key)]));
for (const x of projects) {
  const p = 'works/' + x.slug;
  const sibs = byCat[x.category];
  const i = sibs.indexOf(x);
  const prev = sibs[(i - 1 + sibs.length) % sibs.length], next = sibs[(i + 1) % sibs.length];
  const gallery = (x.gallery || []).filter(g => g.src && g.src !== x.hero.src);
  const rows = [];
  for (let k = 0; k < gallery.length; k += 2) rows.push(gallery.slice(k, k + 2));
  const desc = (x.description || []);
  const meta = [];
  if (x.collaborators?.length) meta.push(`<section class="meta-block"><h2>Collaborators</h2><ul class="credits">${x.collaborators.map(c =>
    `<li><span class="credit-name">${esc(c.name)}</span><span class="credit-role">${esc(c.role)}</span></li>`).join('')}</ul></section>`);
  if (x.recognition?.length) meta.push(`<section class="meta-block"><h2>Recognition</h2><ul class="recognition">${x.recognition.map(r =>
    `<li>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : esc(r.name)}</li>`).join('')}</ul></section>`);
  page(p, x.title, 'works', `<article class="project">
  <header class="page-head project-head"><h1 class="page-title">${esc(x.title)}</h1>
    <p class="project-kicker"><a href="${href(p, catPath(x.category))}">${esc(catLabel(x.category))}</a>${x.location ? ` <span aria-hidden="true">·</span> ${esc(x.location)}` : ''}</p></header>
  <figure class="project-hero"><span class="hero-box"${box(x.hero, 'landscape')}>${img(p, x.hero, { alt: x.title, lazy: false, priority: true, sizes: 'full' })}</span></figure>
${desc.length ? `  <div class="prose project-text">${desc.map(d => `<p>${esc(d)}</p>`).join('\n')}</div>\n` : ''}${rows.length ? `  <div class="gallery">
${rows.map(r => `    <div class="gallery-row">${r.map(g => {
    return `<figure${box(g, DEMO_GALLERY[gallery.indexOf(g) % DEMO_GALLERY.length])}>${img(p, g, { alt: g.alt || `${x.title}` })}</figure>`;
  }).join('')}</div>`).join('\n')}
  </div>\n` : ''}${meta.length ? `  <div class="project-meta">${meta.join('')}</div>\n` : ''}  <nav class="pager" aria-label="More projects">
    <a href="${href(p, 'works/' + prev.slug)}" rel="prev"><span>Previous</span>${esc(prev.title)}</a>
    <a href="${href(p, 'works/' + next.slug)}" rel="next"><span>Next</span>${esc(next.title)}</a>
  </nav>
</article>`, { description: desc[0] || `${x.title}, a ${catLabel(x.category).toLowerCase()} project by ${site.name}.`, image: srcRoot(x.hero.src) });
}

/* ---------- press ---------- */
const pressTabs = [['press', 'Media'], ['press/awards', 'Awards'], ['press/events', 'Events']];
const pressGrid = (p, items, cta) => `<ul class="press-grid">
${items.map((m, i) => {
  const inner = `<span class="press-media">${img(p, m.image, { alt: m.title, lazy: i > 5, sizes: 'card' })}<span class="press-cta" aria-hidden="true">${cta} <span class="arrow">↗</span></span></span><span class="press-title">${esc(m.title)}</span>`;
  return `  <li>${m.url ? `<a class="press-card" href="${esc(m.url)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="press-card is-static">${inner}</div>`}</li>`;
}).join('\n')}
</ul>`;
page('press', 'Press', 'press', `${head('press', 'Press', pressTabs, 'Press sections')}\n${pressGrid('press', press.media, 'Go to Article')}`);
page('press/awards', 'Awards', 'press', `${head('press/awards', 'Press', pressTabs, 'Press sections')}\n${pressGrid('press/awards', press.awards, 'View Award')}`);
page('press/events', 'Events', 'press', `${head('press/events', 'Press', pressTabs, 'Press sections')}\n${pressGrid('press/events', press.events, 'View Event')}`);

/* ---------- contact ---------- */
const contactTabs = [['contact', 'About'], ['contact/people', 'People'], ['contact/services', 'Services']];
page('contact', 'Contact', 'contact', `${head('contact', 'Contact', contactTabs, 'Contact sections')}
<div class="split">
  <div class="split-main">
    <div class="prose justify">${site.about.map(a => `<p>${a}</p>`).join('\n')}</div>
    <address class="address">${site.address.map(esc).join('<br>')}</address>
    <dl class="contact-list">${site.contacts.map(c => `<div><dt>${esc(c.label)}</dt><dd><a href="${esc(c.href)}">${esc(c.value)}</a></dd></div>`).join('')}</dl>
  </div>
  <figure class="split-aside">${img('contact', site.officePhoto, { lazy: false })}</figure>
</div>`, { description: `${site.name}, ${site.address.join(', ')}. ${site.contacts[0].value}.` });

const hasProfile = x => x.profile !== false;
page('contact/people', 'People', 'contact', `${head('contact/people', 'Contact', contactTabs, 'Contact sections')}
<ul class="people-grid">
${people.map((x, i) => {
  const inner = `<span class="person-photo">${img('contact/people', x.photo, { alt: x.name, lazy: i > 8, sizes: 'thumb' })}</span><span class="person-name">${esc(x.name)}</span><span class="person-title">${esc(x.title)}</span>`;
  return `  <li>${hasProfile(x) ? `<a class="person" href="${href('contact/people', 'contact/people/' + x.slug)}">${inner}</a>` : `<div class="person">${inner}</div>`}</li>`;
}).join('\n')}
</ul>`);

for (const x of people.filter(hasProfile)) {
  const p = 'contact/people/' + x.slug;
  const phone = site.contacts[0];
  page(p, x.name, 'contact', `${head(p, 'Contact', contactTabs, 'Contact sections', 'p', 'contact/people')}
<div class="split profile">
  <div class="split-main">
    <span class="person-photo is-color">${img(p, x.photo, { alt: x.name, lazy: false, sizes: 'thumb' })}</span>
    <h1 class="profile-name">${esc(x.name)}${x.credentials ? `<span class="creds">, ${esc(x.credentials)}</span>` : ''}</h1>
    <p class="profile-title">${esc(x.title)}</p>
    <p class="profile-contact"><a href="${esc(phone.href)}${x.extension ? ',' + esc(x.extension) : ''}">${esc(phone.value)}${x.extension ? `&ensp;×${esc(x.extension)}` : ''}</a>${x.email ? `<br><a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}</p>
    ${x.education ? `<section class="profile-block"><h2>Credentials</h2><p>${esc(x.education)}</p></section>` : ''}
    ${x.bio?.length ? `<section class="profile-block"><h2>Experience</h2>${x.bio.map(b => `<p>${esc(b)}</p>`).join('')}</section>` : ''}
    <p class="back"><a href="${href(p, 'contact/people')}">← All people</a></p>
  </div>
  ${x.inspiration?.src ? `<figure class="split-aside inspiration">${img(p, x.inspiration.src, { alt: x.inspiration.caption })}<figcaption>${esc(x.inspiration.caption)}</figcaption></figure>` : ''}
</div>`, { description: `${x.name}, ${x.title} at ${site.name}.` });
}

page('contact/services', 'Services & Process', 'contact', `${head('contact/services', 'Contact', contactTabs, 'Contact sections')}
<p class="lede">${esc(services.intro)}</p>
<ol class="phases">
${services.phases.map((ph, i) => `  <li class="phase">
    <h2 class="phase-name"><span class="phase-no">${String(i + 1).padStart(2, '0')}</span>${esc(ph.name)}</h2>
    <dl class="phase-meta">
      <div><dt>Purpose</dt><dd>${esc(ph.purpose)}</dd></div>
      <div><dt>Timeline</dt><dd>${esc(ph.timeline)}</dd></div>
      <div><dt>Meetings</dt><dd>${esc(ph.meetings)}</dd></div>
    </dl>
    <div class="phase-tasks"><h3>Tasks</h3><ul>${ph.tasks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>${ph.required ? `<h3>Required</h3><ul>${ph.required.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div>
  </li>`).join('\n')}
</ol>`, { description: services.intro });

/* ---------- 404 ---------- */
page('404', 'Not found', '', `<div class="notfound"><h1 class="page-title">This page has moved.</h1><p><a href="${href('404', 'works')}">See selected works</a> or <a href="${href('404', '')}">return home</a>.</p></div>`);

/* ---------- write ---------- */
await fs.rm(OUT, { recursive: true, force: true });
for (const pg of pages) {
  const out = pg.p === '404' ? path.join(OUT, '404.html') : path.join(OUT, pg.p, 'index.html');
  await fs.mkdir(path.dirname(out), { recursive: true });
  // 404.html sits at the root, so rebuild its relative links from there
  const html = pg.p === '404' ? layout({ ...pg, p: '' }) : layout(pg);
  await fs.writeFile(out, html);
}

// search index
const index = [
  ...projects.map(x => ({ t: x.title, k: 'Project', u: `works/${x.slug}/`, i: thumbRoot(x.hero.src), s: [x.title, catLabel(x.category), x.location, ...(x.collaborators || []).map(c => c.name)].filter(Boolean).join(' ') })),
  ...people.map(x => ({ t: x.name, k: x.title, u: hasProfile(x) ? `contact/people/${x.slug}/` : 'contact/people/', i: thumbRoot(x.photo), s: `${x.name} ${x.title} people team` })),
  ...[...press.media.map(m => ({ ...m, k: 'Press' })), ...press.awards.map(m => ({ ...m, k: 'Award' })), ...press.events.map(m => ({ ...m, k: 'Event' }))]
    .map(m => ({ t: m.title, k: m.k, u: m.url || 'press/', x: !!m.url, i: thumbRoot(m.image), s: `${m.title} ${m.k}` })),
  { t: 'Services & Process', k: 'Page', u: 'contact/services/', s: 'services process fees phases schematic design permit construction' },
  { t: 'About & Contact', k: 'Page', u: 'contact/', s: 'about contact address phone email careers jobs employment media' }
];
await fs.mkdir(path.join(OUT, 'assets'), { recursive: true });
await fs.writeFile(path.join(OUT, 'assets', 'search-index.js'), `window.JLA_INDEX=${JSON.stringify(index)};\n`);
for (const f of await fs.readdir(path.join(ROOT, 'src'))) {
  if (f === 'images') continue;
  await fs.copyFile(path.join(ROOT, 'src', f), path.join(OUT, 'assets', f));
}
if (existsSync(path.join(ROOT, 'images'))) await fs.cp(path.join(ROOT, 'images'), path.join(OUT, 'images'), { recursive: true });

// redirects from the WordPress URLs (Netlify / Cloudflare Pages format)
if (!PREVIEW) {
  const r = [
    ...projects.map(x => `/project/${x.slug}/  /works/${x.slug}/  301`),
    '/live/  /works/  301', '/work/  /works/commercial/  301', '/make/  /works/fabrication/  301',
    '/on-the-boards/  /works/on-the-boards/  301', '/awards_events/  /press/awards/  301',
    '/profile/  /contact/  301', '/people/  /contact/people/  301', '/our-process/  /contact/services/  301',
    '/jobs/  /contact/  301', '/news/  /press/  301'
  ];
  await fs.writeFile(path.join(OUT, '_redirects'), r.join('\n') + '\n');
}
console.log(`Built ${pages.length} pages -> ${path.relative(ROOT, OUT)}/`);
