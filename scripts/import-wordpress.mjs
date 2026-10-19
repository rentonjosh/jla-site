// Pull every project from the current WordPress site into content/projects.json.
//
//   node scripts/import-wordpress.mjs              fill in galleries, text, credits, recognition, image sizes
//   node scripts/import-wordpress.mjs --overwrite  replace those fields even where content already exists
//   node scripts/import-wordpress.mjs --download   also copy every image (projects, press, people) into images/
//                                                  and point the content at the local copies. Run this before
//                                                  WordPress is switched off. With `sharp` installed (npm install)
//                                                  originals are resized to 2400px and a 1200px copy is made for
//                                                  grids and phones. Safe to stop and re-run: finished files are kept.
//
// Hand-set fields are never touched: featured, hover, homeImage, heroAspect, location, and project order.
// The old site is a Divi build, so text and galleries live inside shortcodes; this script parses them.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WP = 'https://johnlumarchitecture.com/wp-json/wp/v2';
const UPLOADS = 'https://johnlumarchitecture.com/wp-content/uploads/';
const OVERWRITE = process.argv.includes('--overwrite');
const DOWNLOAD = process.argv.includes('--download');
const contentFile = f => path.join(ROOT, 'content', f);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async (url, tries = 3) => {
  for (let t = 1; ; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'jla-site-import' } });
      if (r.ok || r.status === 404 || t >= tries) return r;
    } catch (e) { if (t >= tries) throw e; }
    await sleep(800 * t);
  }
};
const getJSON = async url => {
  const r = await get(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return { data: await r.json(), pages: +(r.headers.get('x-wp-totalpages') || 1) };
};
const getAll = async url => {
  const first = await getJSON(`${url}${url.includes('?') ? '&' : '?'}per_page=100&page=1`);
  const out = [...first.data];
  for (let p = 2; p <= first.pages; p++) out.push(...(await getJSON(`${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${p}`)).data);
  return out;
};
const pool = async (items, n, fn) => {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); }));
};

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', eacute: 'é', egrave: 'è', agrave: 'à', ntilde: 'ñ', ouml: 'ö', uuml: 'ü' };
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&(\w+);/g, (m, k) => ENT[k] ?? m);
const strip = s => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const lines = html => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>|<\/h\d>|<\/li>/gi, '\n').split('\n').map(strip).filter(Boolean);

const CATEGORY = name => {
  const n = name.toLowerCase();
  if (/board/.test(n)) return 'on-the-boards';
  if (/liv|resid/.test(n)) return 'residential';
  if (/mak|fab/.test(n)) return 'fabrication';
  if (/work|comm/.test(n)) return 'commercial';
  return null;
};

// Divi stores each project as shortcodes. WordPress "smart quotes" the attribute quotes inside them
// (gallery_ids=”1,2,3”), so those are normalised first. A project page has a sidebar text block
// (LOCATION / CREDITS / RECOGNITION) and a main text block (title, tagline, description); each block is
// read on its own and split at those labels.
const LABEL = /^(location|credits|collaborators|team|recognition|press|awards|publications)\s*:?\s*(.*)$/i;
const SECTION = { location: 'location', credits: 'credits', collaborators: 'credits', team: 'credits',
  recognition: 'recognition', press: 'recognition', awards: 'recognition', publications: 'recognition' };
export function parse(raw, title) {
  raw = raw.replace(/\[[^\]]*\]/g, tag => tag.replace(/&#82(?:20|21|42|43);|&quot;|[“”″′]/g, '"'));
  const blocks = [...raw.matchAll(/\[et_pb_text[^\]]*\]([\s\S]*?)\[\/et_pb_text\]/g)].map(m => m[1]);
  if (!blocks.length) blocks.push(raw.replace(/\[[^\]]+\]/g, ''));

  const out = { description: [], collaborators: [], recognition: [], location: '' };
  for (const block of blocks) {
    let section = 'desc';
    const segs = block.replace(/<\/p>|<\/h\d>|<\/li>|<\/div>/gi, '$&\n').split(/<br\s*\/?>|\n/i);
    for (const seg of segs) {
      const plain = strip(seg);
      if (!plain) continue;
      const lab = plain.match(LABEL);
      // a label is a short line on its own ("CREDITS") or a label with its value ("Location: Palo Alto")
      if (lab && (lab[2] === '' || /:/.test(plain)) && plain.length < 80) {
        section = SECTION[lab[1].toLowerCase()];
        if (!lab[2]) continue;
      }
      const text = lab && /:/.test(plain) && SECTION[lab[1].toLowerCase()] === section ? lab[2] : plain;
      if (section === 'desc') {
        if (text.toLowerCase() !== title.toLowerCase()) out.description.push(text);
      } else if (section === 'location') {
        if (!out.location) out.location = text;
      } else if (section === 'credits') {
        const m = text.match(/^([^:]{2,40}):\s*(.+)$/);
        out.collaborators.push(m ? { name: m[2].trim(), role: m[1].trim() } : { name: text, role: '' });
      } else {
        const a = seg.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        const name = strip(a ? a[2] : seg);
        if (name) out.recognition.push(a ? { name, url: decode(a[1]) } : { name });
      }
    }
  }
  // paragraphs: merge lines that the old site broke with <br> mid-paragraph is not attempted; each <p> stays a paragraph
  const galleryIds = [...raw.matchAll(/gallery_ids="([\d,\s]+)"/g)].flatMap(m => m[1].split(',').map(x => +x.trim()).filter(Boolean));
  let imageSrcs = [...raw.matchAll(/\[et_pb_image[^\]]*\bsrc="([^"]+)"/g)].map(m => m[1]);
  if (!galleryIds.length && !imageSrcs.length) {
    imageSrcs = [...new Set([...raw.matchAll(/<(?:img|a)\b[^>]*(?:src|href)="([^"]+\/wp-content\/uploads\/[^"]+\.(?:jpe?g|png|webp))"/gi)]
      .map(m => m[1].replace(/-\d+x\d+(\.\w+)$/, '$1')))];
  }
  return { ...out, galleryIds, imageSrcs };
}

const asImg = m => m && ({ src: m.source_url, w: m.media_details?.width, h: m.media_details?.height, ...(m.alt_text ? { alt: m.alt_text } : {}) });
const same = (a, b) => a && b && a.replace(/-scaled(\.\w+)$/, '$1') === b.replace(/-scaled(\.\w+)$/, '$1');

async function importProjects() {
  console.log('Reading categories and projects from WordPress…');
  let cats = [];
  try { cats = await getAll(`${WP}/project_category?_fields=id,name,slug`); }
  catch (e) { console.warn(`  could not read categories (${e.message}); existing projects still update, new ones are skipped`); }
  const catOf = Object.fromEntries(cats.map(c => [c.id, CATEGORY(c.slug + ' ' + c.name)]));
  const posts = await getAll(`${WP}/project?_fields=id,slug,title,content,featured_media,project_category,menu_order,date`);
  console.log(`  ${posts.length} projects, ${cats.length} categories`);

  const parsed = posts.map(p => ({ p, title: strip(p.title.rendered), ...parse(p.content.rendered || p.content.raw || '', strip(p.title.rendered)) }));
  const ids = [...new Set(parsed.flatMap(x => [x.p.featured_media, ...x.galleryIds]).filter(Boolean))];
  const media = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data } = await getJSON(`${WP}/media?include=${chunk.join(',')}&per_page=100&_fields=id,source_url,media_details,alt_text`);
    data.forEach(m => media.set(m.id, m));
  }
  console.log(`  ${media.size} images resolved`);

  const existing = JSON.parse(await fs.readFile(contentFile('projects.json'), 'utf8'));
  const bySlug = new Map(existing.map(x => [x.slug, x]));
  const fill = (x, key, val) => { if (val?.length && (OVERWRITE || !x[key]?.length)) x[key] = val; };
  let added = 0;

  for (const r of parsed) {
    const category = (r.p.project_category || []).map(id => catOf[id]).find(Boolean);
    let x = bySlug.get(r.p.slug);
    if (!x) {
      if (!category) { console.warn(`  skipped ${r.p.slug}: no category`); continue; }
      x = { slug: r.p.slug, title: r.title, category };
      existing.push(x); bySlug.set(x.slug, x); added++;
    }
    const hero = asImg(media.get(r.p.featured_media));
    if (hero) {
      if (!x.hero || OVERWRITE) x.hero = hero;
      else if (same(x.hero.src, hero.src)) Object.assign(x.hero, { w: hero.w, h: hero.h });
    }
    const gallery = [...r.galleryIds.map(id => asImg(media.get(id))).filter(Boolean), ...r.imageSrcs.map(src => ({ src }))];
    fill(x, 'gallery', gallery);
    fill(x, 'description', r.description);
    fill(x, 'collaborators', r.collaborators);
    fill(x, 'recognition', r.recognition);
    if (r.location && (OVERWRITE || !x.location)) x.location = r.location;
    // dimensions for hand-picked hover / home images that match a known upload
    for (const k of ['hover', 'homeImage']) {
      const m = x[k] && (x.gallery || []).find(g => same(g.src, x[k].src));
      if (m?.w) Object.assign(x[k], { w: m.w, h: m.h });
    }
  }
  await fs.writeFile(contentFile('projects.json'), JSON.stringify(existing, null, 2) + '\n');
  console.log(`  projects.json updated (${added} new)`);
  return existing;
}

/* ---------- --download: copy images local ---------- */
let sharp = null;
const SMALL = 1200;
const smallName = rel => rel.replace(/(\.\w+)$/, `-${SMALL}$1`);
async function localize(url, dir) {
  const full = /^https?:/.test(url) ? url : UPLOADS + url;
  if (!full.startsWith(UPLOADS)) return null;
  // keep the upload's year/month in the name: different years reuse names like Plain.jpg
  const name = decodeURIComponent(full.slice(UPLOADS.length)).replace(/\//g, '-').replace(/[^\w.\-]+/g, '-');
  const rel = `images/${dir}/${name}`;
  const out = path.join(ROOT, rel);
  const raster = /\.(jpe?g|png|webp)$/i.test(name);
  if (!existsSync(out)) {
    const r = await get(full);
    if (!r.ok) { console.warn(`  could not download ${full} (${r.status})`); return null; }
    let buf = Buffer.from(await r.arrayBuffer());
    await fs.mkdir(path.dirname(out), { recursive: true });
    if (sharp && raster) {
      buf = await sharp(buf).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .toFormat(/\.png$/i.test(name) ? 'png' : 'jpeg', { quality: 82, mozjpeg: true }).toBuffer();
    }
    await fs.writeFile(out + '.part', buf);        // a stopped run never leaves a half-written photo behind
    await fs.rename(out + '.part', out);
  }
  let w, h;
  if (sharp && raster) {
    ({ width: w, height: h } = await sharp(out).metadata());
    const small = path.join(ROOT, smallName(rel));
    if (Math.max(w, h) > SMALL && !existsSync(small)) {
      const buf = await sharp(out).resize({ width: SMALL, height: SMALL, fit: 'inside' })
        .toFormat(/\.png$/i.test(name) ? 'png' : 'jpeg', { quality: 80, mozjpeg: true }).toBuffer();
      await fs.writeFile(small + '.part', buf); await fs.rename(small + '.part', small);
    }
  }
  return { src: rel, w, h };
}

async function download(projects) {
  try { sharp = (await import('sharp')).default; } catch { console.log('  sharp is not installed: photos are copied at full size with no smaller copies. Run "npm install" first for a faster site.'); }
  const jobs = [];
  for (const x of projects) {
    for (const k of ['hero', 'hover', 'homeImage']) if (x[k]?.src) jobs.push([x[k], 'src', `works/${x.slug}`]);
    for (const g of x.gallery || []) jobs.push([g, 'src', `works/${x.slug}`]);
  }
  const press = JSON.parse(await fs.readFile(contentFile('press.json'), 'utf8'));
  for (const list of Object.values(press)) for (const m of list) jobs.push([m, 'image', 'press']);
  const people = JSON.parse(await fs.readFile(contentFile('people.json'), 'utf8'));
  for (const x of people) jobs.push([x, 'photo', 'people']);
  const site = JSON.parse(await fs.readFile(contentFile('site.json'), 'utf8'));
  if (site.officePhoto?.src) jobs.push([site.officePhoto, 'src', 'site']);

  console.log(`Downloading ${jobs.length} images…`);
  let done = 0;
  let failed = 0;
  await pool(jobs, 6, async ([obj, key, dir]) => {
    if (obj[key] && !obj[key].startsWith('images/')) {
      try {
        const r = await localize(obj[key], dir);
        if (r) { obj[key] = r.src; if (key === 'src' && r.w) Object.assign(obj, { w: r.w, h: r.h }); } else failed++;
      } catch (e) { failed++; console.warn(`  failed ${obj[key]}: ${e.message}`); }
    }
    if (++done % 50 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}`);
  });
  if (failed) console.log(`  ${failed} photos could not be copied and still point at WordPress. Re-run to retry them.`);
  await fs.writeFile(contentFile('projects.json'), JSON.stringify(projects, null, 2) + '\n');
  await fs.writeFile(contentFile('press.json'), JSON.stringify(press, null, 2) + '\n');
  await fs.writeFile(contentFile('people.json'), JSON.stringify(people, null, 2) + '\n');
  await fs.writeFile(contentFile('site.json'), JSON.stringify(site, null, 2) + '\n');
  console.log('  images copied into images/ and content updated');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projects = await importProjects();
  if (DOWNLOAD) await download(projects);
  console.log('Done. Review content/*.json, then run: npm run build');
}
