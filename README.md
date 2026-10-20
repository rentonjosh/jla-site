# John Lum Architecture website

Static site built from the JLA Process Options redesign in Figma. Plain HTML, one stylesheet, one small script. No WordPress, no framework, no database. It runs on any static host for free or close to it.

## Structure

```
content/          everything editable
  site.json       name, address, phone, emails, About copy, office photo, categories
  projects.json   every project: title, category, hero, hover image, gallery, text, credits, recognition
  press.json      Media, Awards, Events
  people.json     team + profile details
  services.json   Services & Process phases
src/              styles.css, site.js, favicon.svg  (copied to dist/assets/)
images/           local photos once imported (copied to dist/images/)
build.mjs         generates the site
scripts/import-wordpress.mjs   pulls content and photos out of the current WordPress site
```

## Working from GitHub (no local copy needed)

- **Photos:** Actions tab > *Import photos from WordPress* > Run workflow. GitHub's servers read every project from WordPress, copy all photos into `images/` (resized to 2400px, plus 1200px copies), fill in project text and credits, check the site builds, and commit the result. Safe to re-run; finished photos are kept. Tick *overwrite* only to replace text you have already edited.
- **Edits:** change `content/*.json` in the GitHub web editor (press `.` on the repo page for a full editor). Every commit redeploys the site.
- **Your own photos:** upload into `images/works/<project-slug>/` with *Add file > Upload files*, then point `hero` or `gallery` at them.

## Commands (if you do work locally)

```
npm run build          # -> dist/  (clean URLs, what you deploy)
npm run serve          # look at dist/ on http://localhost:3000
npm run preview        # -> preview/  (links end in index.html, opens straight from disk)
node build.mjs --demo  # -> preview-demo/  fixed 4:3 / 3:4 rhythm for previews where photos can't load
npm run import         # fill every project's gallery, text, credits and image sizes from WordPress
npm run import:images  # same, plus copy every photo into images/ (do this before WordPress is turned off)
npm run photos         # all of it in one go: install, import + copy photos, build dist/ and preview/
```

Node 18 or newer. `npm install` adds `sharp`, which the photo import uses to resize originals to 2400px and make the 1200px copies that grids, search and phones load.

## Pages

| URL | Page |
|---|---|
| `/` | Slideshow of `featured` projects (drag, sideways swipe or arrow keys; loops), then the studio statement from `site.json` and category links |
| `/works/` `/works/commercial/` `/works/fabrication/` `/works/on-the-boards/` | Selected Works, masonry grid |
| `/works/<slug>/` | Project page: screen-height hero the page slides over, a sticky bar (Information, Photos, Next project), the first description paragraph as the lead with the rest beside a facts column, a composed gallery, and three more projects from the same category |
| `/press/` `/press/awards/` `/press/events/` | Press |
| `/contact/` `/contact/people/` `/contact/people/<slug>/` `/contact/services/` | About, People, profiles, Services & Process |

Asset links carry a version stamp, so a new deploy is never hidden behind a browser's cached copy.

Desktop scrolling is weighted (it eases to a stop), and anything that starts below the fold rises into place as it arrives. Both switch off for people who have reduced motion turned on, and touch scrolling is left native.

Gallery rows are composed automatically from the photos' orientations: screen-sized singles, pairs, and singles set to the left or right, always in 4:3 or 3:4 boxes with the page margin as every gap.

Search (header, or press `/` anywhere) opens a panel under the header over the shaded page. Before typing it shows the slideshow projects; results are grouped into Projects, People, Press and Pages and match titles, categories, locations, collaborators and publications. Arrow keys move through results, Enter opens the first, Esc or a click on the shade closes it.

On project pages, clicking a photo enlarges it in place: it grows from its spot to fill the screen, uncropped, over a shaded and blurred page. Click the shaded area, press Esc or scroll to put it back. The small triangles at the sides (under the photo on phones), the arrow keys or a sideways swipe move to the next photo while enlarged.

`dist/_redirects` maps every old WordPress URL (`/project/golden-gate/`, `/live/`, `/our-process/` …) to its new home with a 301, so existing Google rankings and press links keep working. Netlify and Cloudflare Pages read this file as is.

## Editing projects

```json
{
  "slug": "golden-gate",
  "title": "Golden Gate Heights",
  "category": "residential",
  "featured": 1,
  "location": "San Francisco, CA",
  "hero":  { "src": "images/works/golden-gate/Ortega_34_LR.jpg", "w": 2400, "h": 1734, "orientation": "portrait" },
  "hover": { "src": "images/works/golden-gate/Ortega_15_LR.jpg" },
  "gallery": [ { "src": "...", "w": 1600, "h": 2400 } ],
  "description": ["Paragraph one", "Paragraph two"],
  "collaborators": [ { "name": "Floyd Construction", "role": "Contractor" } ],
  "recognition": [ { "name": "Westside DIGS", "url": "https://..." } ]
}
```

- `featured`: puts the project in the home slideshow; the number sets its order.
- `hover`: the image the Works card fades to on hover (interior if the hero is an exterior, or the reverse). Without it the card just reveals the title.
- Every photo box is exactly 4:3 (landscape) or 3:4 (portrait). Each box follows its photo's own orientation: from `w`/`h` once the importer has recorded them, otherwise detected in the browser when the photo loads. Add `"orientation": "portrait"` or `"landscape"` to any image (hero, gallery item, hover, homeImage) to force it, for instance a portrait crop of a landscape hero to break up the Works grid.
- `homeImage`: optional different photo for the home slideshow.
- Order in the file is the order on the site.
- Image `src` can be a local `images/...` path, a full URL, or a WordPress upload path like `2022/05/Ortega_34_LR.jpg`.

## Deploying

Cloudflare Pages (free, unlimited bandwidth): Workers & Pages > Create > Pages > Connect to Git, pick this repo, framework preset *None*, build command `npm run build`, output directory `dist`. Every commit deploys, and every branch gets its own preview link. Netlify works the same way.

A staging copy also publishes to GitHub Pages on every change (`.github/workflows/preview.yml`), marked noindex so it never competes with the real site in search. It needs the repo to be public, or a paid GitHub plan once it's private; Cloudflare Pages has no such limit.

Point the domain at it once the import is done and checked.

## Before launch

- Run the photo import workflow while WordPress is still up.
- Check `instagram` in `content/site.json`.
- Set `hover` images on the projects that matter most.
- Inter is the only typeface and loads from Google Fonts (full weight range). To self-host instead, download the variable font from rsms.me/inter, put the woff2 in `src/`, add an `@font-face` for it at the top of `styles.css`, and remove the Google Fonts link in `build.mjs`.

The logo lives in `src/logo.svg`, traced from `brand/jla-logo.png`. The favicon is its L.
