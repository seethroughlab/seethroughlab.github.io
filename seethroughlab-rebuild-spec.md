# See-Through Lab Site Rebuild — Claude Code Spec

## Overview

Rebuild `seethroughlab.com` as a self-hosted static site using **Astro**, replacing Squarespace. The site should closely match the current visual aesthetic (clean, minimal, dark, typography-forward — work takes center stage). Content lives in MDX files in the repo. Videos are self-hosted on S3/CloudFront. The architecture is designed to add a Node.js backend (Fly.io) later with zero framework changes.

---

## Responsive & Mobile Requirements

The site must be fully responsive and mobile-first. This is a hard requirement, not a polish step.

- **Approach**: Mobile-first CSS via Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`). Start from the smallest viewport and scale up — never desktop-first with overrides.
- **Breakpoints**: Design for three tiers — mobile (< 640px), tablet (640–1024px), desktop (> 1024px).
- **Project grid**: Single column on mobile → 2 columns on tablet → 2–3 columns on desktop. Use CSS Grid with `auto-fill` / `minmax` so it adapts fluidly.
- **Navigation**: Hamburger menu on mobile (minimal, no heavy libraries — a simple Astro island with a `<details>` toggle or a tiny `useState` in a React island is fine). Full horizontal nav on desktop.
- **Video player**: `aspect-ratio: 16/9` container so the player scales correctly at all viewports. Never fixed pixel dimensions.
- **Typography**: Fluid type scale using Tailwind's clamp-based `text-fluid` approach or a simple custom scale — headings should feel proportional on a phone, not just shrunk.
- **Images**: Always use Astro's `<Image>` component with `width`, `height`, and `loading="lazy"`. Serve appropriately sized images via Astro's built-in image optimization.
- **Touch targets**: All interactive elements (nav links, project cards, buttons) must be at minimum 44×44px tap targets per WCAG guidelines.
- **Testing**: Claude Code should include a note in the README to test with Chrome DevTools device emulation at iPhone SE (375px), iPad (768px), and standard desktop (1440px) before considering any feature done.

---

## Design Tokens & Visual Direction

Extracted from the current seethroughlab.com. Claude Code must use these values — do not substitute generic defaults.

### Colors
```css
--color-bg:           #0a0a0a;   /* near-black, not pure #000 */
--color-surface:      #111111;   /* project card dark panels */
--color-text-primary: #ffffff;
--color-text-muted:   #666666;   /* inactive nav items, secondary labels */
--color-border:       #1a1a1a;   /* subtle dividers if needed */
```

### Typography
```css
/* Tagline + body copy */
--font-sans: system-ui, -apple-system, "Helvetica Neue", sans-serif;

/* Project titles on cards */
--font-serif: Georgia, "Times New Roman", serif;

/* Sizes */
--text-nav:       0.9rem;    /* uppercase or normal weight nav links */
--text-tagline:   1.1rem;    /* "Experimental art & technology studio." */
--text-card-title: 2.5rem;  /* large serif project title on hover/card panel */
--text-body:      1rem;
--line-height:    1.6;
```

### Logo
The wordmark ("SEE / THROUGH / LAB") uses a **chromatic aberration / RGB channel split** effect — large, bold, stacked, with red/blue/yellow color fringing. This is the defining visual element of the brand.

Implementation: SVG or styled `<h1>` using CSS `text-shadow` with offset red and blue shadows on white text:
```css
.logo {
  font-size: clamp(3rem, 10vw, 7rem);
  font-weight: 900;
  color: #ffffff;
  text-shadow:
    -3px 0 3px rgba(255, 50, 50, 0.8),
     3px 0 3px rgba(50, 100, 255, 0.8),
     0  2px 3px rgba(255, 220, 0, 0.5);
  letter-spacing: -0.02em;
  line-height: 0.9;
  text-align: center;
}
```
If the current logo is an SVG asset, extract and reuse it directly rather than recreating in CSS.

### Layout
- Max content width: `1400px`, centered with `auto` horizontal margins
- Page padding: `1.5rem` on mobile, `3rem` on desktop
- Header: centered — logo stacked above tagline, nav links below on one line
- Nav: centered text links, no underline, `letter-spacing: 0.05em`, muted color on inactive items
- Project grid: 2 columns on desktop (image | dark title panel, side by side per row), 1 column on mobile
- Each project row: image takes ~50% width, title panel takes ~50% with large serif title centered vertically
- No visible card borders or box shadows — separation is purely color contrast (image vs. dark panel)
- Generous vertical spacing between rows (`4rem`+)

### Interaction
- Project cards: subtle hover state — slight brightness increase on image, title becomes fully white if muted
- No heavy animations — this is a minimal, work-first portfolio
- Cursor: default (no custom cursors)

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Astro 4.x | Static by default; escape hatch to SSR without changing frameworks |
| Styling | Tailwind CSS | Utility-first, no design system overhead |
| Content | Astro Content Collections (MDX) | AI/editor-friendly, no database, typed schema |
| Video | AWS S3 + CloudFront + HLS.js | Vimeo replacement; adaptive streaming |
| Deployment | GitHub Pages via GitHub Actions | Push-to-publish, zero cost |
| Future backend | Fly.io + Astro Node adapter | "Ask Jeff" AI chat, SSR endpoints |
| Future contact | Formspree or Resend | If a contact form is ever added |

---

## Site Structure

```
/                    → Home (project grid)
/projects/[slug]     → Individual project pages
/research            → Research index (Familiar, Vivid, ChordBox, 1 Hour Experiment, Ambient Generator, Interactive Frank 2)
/research/[slug]     → Individual research pages
/lab/ambient-generator   → Live interactive experiment (migrated from dev.seethroughlab.com)
/lab/interactive-frank-2 → Live interactive experiment (migrated from dev.seethroughlab.com)
/about               → About / bio
/contact             → Email + socials (no form)
```

Navigation: Home · Research · About · Contact

---

## Content Model

All content lives in `src/content/`. Astro Content Collections enforce typed frontmatter via Zod schemas.

### Projects (`src/content/projects/`)

```yaml
---
title: "The Dreamwall"
slug: "dreamwall"
client: "Google"
year: 2023
tags: ["TouchDesigner", "LED", "Generative AI"]
coverImage: "./images/dreamwall-cover.jpg"
videoSrc: "https://cdn.seethroughlab.com/videos/dreamwall/index.m3u8"  # HLS
featured: true
order: 1
---
MDX body: project description, embed images/video, credits
```

### Research (`src/content/research/`)

```yaml
---
title: "Vivid"
slug: "vivid"
subtitle: "A creative coding framework optimized for LLM-assisted development"
status: "active"  # active | archived | experiment
githubUrl: "https://github.com/jeffcrouse/vivid"
coverImage: "./images/vivid-cover.jpg"
labUrl: ""         # for /lab/* experiments; empty otherwise
instagramPosts: [] # list of post URLs for Instagram-embedded research
---
MDX body: writeup, screenshots, demos, links
```

All six research entries and their key properties:

| Slug | Title | Type | Notes |
|---|---|---|---|
| `vivid` | Vivid | Software | GitHub link |
| `familiar` | Familiar | Software | GitHub link |
| `chord-box` | ChordBox | Hardware | GitHub link |
| `one-hour-experiment` | The 1 Hour Experiment | Social | Writeup + embedded Instagram posts |
| `ambient-generator` | Ambient Generator | Live experiment | Links to `/lab/ambient-generator` |
| `interactive-frank-2` | Interactive Frank 2 | Live experiment | Links to `/lab/interactive-frank-2` |

### Site Config (`src/content/config.ts`)
Zod schemas for both collections — enforces required fields at build time so broken frontmatter fails loudly.

---

## Pages

### Home (`/`)
- Full-bleed project grid, 2–3 columns depending on viewport
- Each card: cover image/video thumbnail, title, client, year
- Clicking a card → `/projects/[slug]`
- Featured projects can be marked to appear first
- Minimal header: logo/wordmark left, nav right
- Footer: copyright, social links

### Project Page (`/projects/[slug]`)
- Hero: full-width video (HLS) or image
- Title, client, year, tags
- MDX body: description, supporting images, credits
- Back link to home

### Research Index (`/research`)
- Clean list or card grid of all six research entries (Familiar, Vivid, ChordBox, 1 Hour Experiment, Ambient Generator, Interactive Frank 2)
- Name, subtitle, status badge, cover image
- Experiment entries show a "Launch" button linking to `/lab/[slug]`

### Research Page (`/research/[slug]`)
- MDX-driven writeup
- Screenshots and demo embeds
- Links to GitHub repo, live experiment, or Instagram as appropriate
- For the 1 Hour Experiment: renders embedded Instagram posts from `instagramPosts` frontmatter array using an `InstagramEmbed.astro` component (oEmbed, no API key required). Static fallback image per post in case the embed fails.
- For Ambient Generator and Interactive Frank 2: prominent "Launch Experiment" button linking to `/lab/[slug]`

### Lab Pages (`/lab/ambient-generator`, `/lab/interactive-frank-2`)

Both experiments are **pure static HTML/CSS/JS with no build step** — they run directly in a browser via a local HTTP server. Migration is straightforward: copy files into `public/lab/[slug]/` and they'll be served as-is. All local asset paths are relative, so no path changes are needed when served from a subdirectory.

**Interactive Frank 2** (`frank2/`):
- 3 files: `index.html`, `styles.css`, `app.js`
- External deps loaded via CDN: Tone.js, js-yaml
- Audio files streamed from `frank-radio.s3.amazonaws.com` (already set up, no changes needed)
- Migration: copy 3 files to `public/lab/interactive-frank-2/` — done

**Ambient Generator** (`noise/`):
- Multi-file ES module app: `index.html`, `index.css`, `noise-processors.js`, `js/` module folder
- External deps via CDN: Tone.js, nouislider
- Noise generation uses WebAudio API AudioWorklets (no local audio files)
- Audio clips: streams live internet radio from hardcoded HTTP URLs (e.g. `http://ec2.yesstreaming.net:3540/stream`)
- ⚠️ **Mixed content issue**: The new site is served over HTTPS. Browsers will block HTTP audio streams. Before deploying, replace all stream URLs in `js/modules/config.js` with HTTPS equivalents or find replacement HTTPS radio streams.
- Migration: copy all files to `public/lab/ambient-generator/`, then fix stream URLs

**Both experiments** should be wrapped in the site's `Base.astro` layout with nav/footer. Since they're in `public/`, they bypass Astro's rendering — instead, create thin wrapper pages at `src/pages/lab/ambient-generator.astro` and `src/pages/lab/interactive-frank-2.astro` that redirect to or iframe the experiments, or simply inline the HTML inside the Astro layout using `<Fragment>` and `set:html`.

The simplest approach: serve the raw experiment files from `public/lab/[slug]/index.html` and link to them directly from the Research pages. They won't have the site nav, but they'll work immediately with zero risk of breaking the JS.


### About (`/about`)
- Bio text (MDX)
- Client logos or list
- Skills/tools list
- Headshot optional

### Contact (`/contact`)
- Email address (obfuscated against scrapers)
- Links: LinkedIn, GitHub, Instagram, Vimeo (legacy), any others
- No form

---

## Video Pipeline

Self-hosted replacement for Vimeo. All videos are encoded to HLS (adaptive bitrate) and served via CloudFront.

### Storage Layout (S3)
```
s3://seethroughlab-media/
  videos/
    [slug]/
      index.m3u8          ← HLS master playlist
      1080p/
        index.m3u8
        segment000.ts
        ...
      720p/
        ...
      480p/
        ...
      poster.jpg
```

### Processing Script (`scripts/process-video.sh`)
Uses FFmpeg to transcode source file into three HLS renditions:

```bash
# Usage: ./scripts/process-video.sh input.mp4 slug
```

Steps:
1. Transcode to 1080p, 720p, 480p HLS segments (FFmpeg)
2. Generate master playlist referencing all renditions
3. Extract poster frame at 2s
4. Upload everything to S3 under `videos/[slug]/`
5. Output the CloudFront URL for the `.m3u8` to copy into frontmatter

Bandwidth tiers: 1080p @ 4Mbps, 720p @ 2Mbps, 480p @ 800kbps

### Player (Frontend)
- `video.js` with `videojs-http-streaming` plugin (the standard HLS.js wrapper)
- Minimal skin: dark background, clean controls, no branding
- Poster image shown before play
- Lazy-loaded — only initializes player JS when video is in viewport
- Falls back gracefully on browsers without HLS support

### Upload Script (`scripts/upload-video.js`)
Node.js script using AWS SDK v3:
- Reads processed video folder
- Sets correct `Content-Type` headers (`.m3u8` → `application/vnd.apple.mpegurl`, `.ts` → `video/mp2t`)
- Sets `Cache-Control: max-age=31536000` on segments (immutable), shorter TTL on playlists
- Outputs CloudFront URL on completion

---

## GitHub Actions — Auto Deploy

File: `.github/workflows/deploy.yml`

```yaml
on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: withastro/action@v2
      - uses: actions/deploy-pages@v4
```

Secrets needed: `GITHUB_TOKEN` (automatic), optionally `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` if video upload is ever CI-triggered.

---

## Future: Backend / "Ask Jeff" (Fly.io)

When ready, this is a one-afternoon migration:

1. Install `@astrojs/node` adapter
2. Change `output: 'static'` → `output: 'server'` in `astro.config.mjs`
3. Add `Dockerfile` (provided below as a stub)
4. Deploy to Fly.io (`fly launch`)
5. Point DNS

No content, components, or pages need to change.

### "Ask Jeff" Chat
- New page `/ask` with a simple chat UI component
- Astro API route `src/pages/api/ask.ts` calls Anthropic API with a system prompt seeded with bio, project list, and capabilities
- Streaming response via `ReadableStream`
- Rate-limited by IP at the edge (Fly.io middleware)

### Fly.io Dockerfile Stub (save for later)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 3000
CMD ["node", "./dist/server/entry.mjs"]
```

---

## Repo Structure

```
seethroughlab/
├── src/
│   ├── components/
│   │   ├── ProjectCard.astro
│   │   ├── VideoPlayer.astro
│   │   ├── InstagramEmbed.astro
│   │   ├── Nav.astro
│   │   └── Footer.astro
│   ├── content/
│   │   ├── config.ts              ← Zod schemas
│   │   ├── projects/
│   │   │   ├── dreamwall.mdx
│   │   │   └── ...
│   │   └── research/
│   │       ├── vivid.mdx
│   │       ├── familiar.mdx
│   │       ├── chord-box.mdx
│   │       ├── one-hour-experiment.mdx
│   │       ├── ambient-generator.mdx
│   │       └── interactive-frank-2.mdx
│   ├── layouts/
│   │   ├── Base.astro
│   │   └── ProjectLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── about.astro
│   │   ├── contact.astro
│   │   ├── research/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   ├── projects/
│   │   │   └── [slug].astro
│   │   └── lab/
│   │       ├── ambient-generator.astro
│   │       └── interactive-frank-2.astro
│   └── styles/
│       └── global.css
├── scripts/
│   ├── process-video.sh           ← FFmpeg HLS encode
│   └── upload-video.js            ← S3 upload
├── public/
│   └── fonts/, favicon, etc.
├── .github/
│   └── workflows/deploy.yml
├── astro.config.mjs
├── tailwind.config.mjs
└── package.json
```

---

## Content Migration — Squarespace Scraper

Rather than using Squarespace's XML export (which targets WordPress and omits portfolio pages), use a custom scraper to extract content directly from the live site and output Astro-ready MDX files.

### Script: `scripts/scrape-squarespace.js`

Node.js script using **Playwright** (headful scraping handles Squarespace's JS-rendered content better than Cheerio).

#### Dependencies
```bash
npm install playwright @playwright/test fs-extra slugify turndown
npx playwright install chromium
```

#### What the script does

1. **Crawls** the live `seethroughlab.com` — starts at the homepage, follows all project links
2. **Extracts** from each project page:
   - Title
   - Body text (converted from HTML → Markdown via `turndown`)
   - All image URLs (full-resolution Squarespace CDN links)
   - Vimeo embed URLs (parsed from iframes)
   - Any visible metadata (client, year, tags — best-effort)
3. **Downloads** all images into `src/content/projects/[slug]/images/`
4. **Outputs** one `.mdx` file per project in `src/content/projects/` with frontmatter pre-populated and a `TODO` comment on any field that couldn't be confidently extracted (e.g. client name, year)
5. **Outputs** a `migration-report.json` summarizing what was found, what was downloaded, and what needs manual attention

#### Output format per project

```mdx
---
title: "The Dreamwall"
slug: "dreamwall"
client: "TODO: add client"
year: 2023  # TODO: verify
tags: []  # TODO: add tags
coverImage: "./images/dreamwall-01.jpg"
videoSrc: ""  # TODO: replace with S3/CloudFront URL after video processing
featured: false
order: 99  # TODO: set display order
---

<!-- Scraped from seethroughlab.com/projects/dreamwall — review and clean up -->

Body text extracted from Squarespace page...
```

#### Vimeo handling

The scraper logs every Vimeo URL it finds (from iframes) to `migration-report.json`. Before canceling Vimeo, manually download each video using `yt-dlp`:

```bash
yt-dlp https://vimeo.com/YOUR_VIDEO_ID -o "raw/%(title)s.%(ext)s"
```

Then run the video processing pipeline (`scripts/process-video.sh`) on each file to produce HLS, upload to S3, and paste the CloudFront `.m3u8` URL back into the relevant MDX frontmatter.

#### About page

Scrape `/about` separately — extract bio text and output as `src/pages/about.mdx` for manual cleanup.

#### Caveats / manual steps after scraping

- **Image quality**: Squarespace CDN URLs sometimes serve resized versions — check each downloaded image is full resolution
- **Text formatting**: `turndown` conversion is imperfect; review each MDX body for garbled headings or list formatting
- **Metadata**: Client, year, and tags almost certainly need to be filled in manually — the script marks these with `TODO:`
- **Order**: Set the `order` field on each project to control homepage grid sequence
- **Videos**: Must be downloaded from Vimeo and re-processed before canceling Vimeo account — do this before cutting over DNS

---

## Implementation Order for Claude Code

1. **Scraper first** — Run `scripts/scrape-squarespace.js` against the live site to generate draft MDX files, download all images, and produce a Vimeo URL list. Do this before any other work while the Squarespace site is still live.
2. **Download Vimeo videos** — Use `yt-dlp` on every URL in `migration-report.json` before canceling Vimeo. Store raw files in `raw/videos/`.
3. **Scaffold** — `npm create astro@latest`, add Tailwind, configure Content Collections schemas
4. **Layout + Nav** — Base layout, header, footer, global styles matching current site aesthetic
5. **Home page** — Project grid pulling from content collection
6. **Project pages** — Dynamic `[slug].astro` with video player component
7. **Research section** — Index + all six detail pages; `InstagramEmbed.astro` component for 1 Hour Experiment
8. **Lab pages** — Migrate Ambient Generator and Interactive Frank 2 from `dev.seethroughlab.com`; wrap in Base layout
9. **About + Contact pages**
10. **Responsive QA pass** — Verify every page at 375px, 768px, 1440px before moving on
11. **GitHub Actions** — Deploy workflow
12. **Video pipeline** — Run `process-video.sh` on each raw video, upload to S3, update MDX frontmatter with CloudFront URLs
13. **Content cleanup** — Review all scraped MDX files, fill in `TODO:` fields, fix formatting
14. **DNS cutover** — Point `seethroughlab.com` at GitHub Pages; decommission `dev.seethroughlab.com`

---

## Resolved Configuration

These were open questions — all resolved below so Claude Code doesn't need to make assumptions:

- **TypeScript**: Use TypeScript throughout. `strict: true` in `tsconfig.json`.
- **Node version**: Pin to Node 20 LTS. Add `.nvmrc` containing `20` and set `node-version: '20'` in GitHub Actions workflow.
- **Custom domain**: Add a `CNAME` file containing `seethroughlab.com` to the repo root. Configure DNS A records to GitHub Pages IPs after cutover.
- **GitHub repo**: `https://github.com/seethroughlab/seethroughlab.github.io` — repo already exists with old content. Claude Code's first commit should replace everything at the root. Archive or delete the old content before scaffolding — do not mix old files with the new Astro project. Configure `astro.config.mjs` with `site: 'https://seethroughlab.com'` and `base: '/'`.
- **AWS region**: `us-east-1`. S3 bucket name: `seethroughlab-media`.
- **Fonts**: System font stack only — no custom web fonts. Fast, clean, matches current site.
- **Analytics**: Omit entirely for now. Easy to add later with a single script tag.
- **Image optimization**: Use Astro's built-in `<Image>` component with Sharp for all project and research images.
- **Email obfuscation**: Small inline script assembles the address from parts at runtime — no backend needed.
- **`dev.seethroughlab.com`**: Decommission after lab pages are verified live (final step of DNS cutover).

