# See Through Lab

Portfolio site for See Through Lab, an experimental art & technology studio.
Built with Astro 5, deployed to GitHub Pages. Live at `https://seethroughlab.com`.

## Tech Stack

- **Astro 5.17** — static output (`astro.config.mjs`)
- **Tailwind CSS 4** — via `@tailwindcss/vite` plugin (no `tailwind.config`; theme in `src/styles/global.css`)
- **MDX** — content authoring (`@astrojs/mdx`)
- **TypeScript** (strict)
- **Node 20** (`.nvmrc`)

## Commands

```bash
npm run dev       # local dev server
npm run build     # production build
npm run preview   # preview production build
```

## Project Structure

```
src/
  components/     # Nav, Footer, ProjectCard, ResearchCard, VideoPlayer,
                  #   ImageCarousel, InstagramEmbed
  content/
    projects/     # 26 MDX files
    research/     # 7 MDX files
  layouts/        # Base.astro (only layout)
  pages/
    index.astro            # homepage
    projects/[slug].astro  # project detail
    research/index.astro   # research listing
    research/[slug].astro  # research detail
  styles/
    global.css             # Tailwind @theme tokens + prose styles
  content.config.ts        # collection schemas

public/
  images/projects/<slug>/  # project images
  home/                    # WebGPU homepage animation (JS + WGSL shaders)
  lab/                     # interactive experiments (ambient-generator, interactive-frank-2)

scripts/
  process-video.sh         # HLS encoding (ffmpeg)
  upload-video.js          # S3 upload
  scrape-squarespace.js    # original site scraper (migration)
  enrich-frontmatter.js    # MDX frontmatter enrichment (migration)
```

## Content Collections

Schemas defined in `src/content.config.ts`.

### Projects

| Field | Type | Notes |
|-------|------|-------|
| title | `string` | required |
| slug | `string` | required |
| client | `string` | defaults `''` |
| year | `number` | optional |
| tags | `string[]` | defaults `[]` |
| coverImage | `string` | defaults `''` |
| videoSrc | `string` | CloudFront HLS URL; defaults `''` |
| featured | `boolean` | defaults `false` |
| order | `number` | sort key; defaults `99` |
| role | `string` | defaults `''` |
| tech | `string[]` | defaults `[]` |

### Research

| Field | Type | Notes |
|-------|------|-------|
| title | `string` | required |
| slug | `string` | required |
| subtitle | `string` | defaults `''` |
| status | `'active' \| 'archived' \| 'experiment'` | defaults `'active'` |
| githubUrl | `string` | defaults `''` |
| coverImage | `string` | defaults `''` |
| labUrl | `string` | defaults `''` |
| instagramPosts | `string[]` | defaults `[]` |

### Hero priority on project pages

Video → Image carousel → Cover image (first available wins).

## Styling Conventions

- **Dark theme**: black bg (`#000`), white primary text, muted gray (`#666`) for body/secondary
- Theme tokens in `src/styles/global.css` `@theme` block — colors, fonts, font sizes, container width
- Prose styles for MDX content in `@layer base` (`.prose` class)
- `.prose-no-images` hides MDX inline images when an `ImageCarousel` is present
- `.logo-text` — chromatic aberration text effect for homepage logo

## Homepage WebGPU Animation

- Source: `public/home/js/` (modules) + `public/home/shaders/` (WGSL)
- Loaded by `Nav.astro` via `<script is:inline type="module" src="/home/js/main.js">`
- CRT scanline background effect + interactive logo rendering
- Falls back gracefully when WebGPU is unavailable

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`):
- Trigger: push to `master` or manual dispatch
- Uses `withastro/action@v3` (Node 20) → `actions/deploy-pages@v4`
- Concurrency group `pages`, does not cancel in-progress deploys

## Video Infrastructure

Project videos are self-hosted on S3/CloudFront with HLS adaptive streaming.

### AWS Resources
- **S3 Bucket**: `seethroughlab-media` (us-east-1)
- **CloudFront Distribution**: `E3HHODJ5DZ82EV` — `d13tobysqmg65w.cloudfront.net`
- **IAM User**: `s3_user` (has S3 + CloudFront permissions)
- **OAC ID**: `E3LVSUOS6K0DW2`

### S3 Layout
```
videos/<slug>/
  ├── original.mp4      ← source file from Vimeo (for future re-encoding)
  ├── index.m3u8        ← master HLS playlist
  ├── 1080p/index.m3u8 + seg_*.ts
  ├── 720p/index.m3u8  + seg_*.ts
  ├── 480p/index.m3u8  + seg_*.ts
  └── poster.jpg        ← frame extracted at 2s
```

### Videos (8 projects)
| Slug | Original Vimeo ID |
|------|-------------------|
| cosmic-crisis | 878052416 |
| pandora-sounds-like-you | 259486511 |
| intel-mega-experience | 259486965 |
| one-time-in-new-orleans | 259501609 |
| driven-by-emotion | 187023351 |
| endec | 168886039 |
| light-echoes | 134693404 |
| acer-predator | 130166758 |

### Scripts
- **`scripts/process-video.sh <input.mp4> <slug>`** — Encodes HLS in 3 renditions (1080p@4Mbps, 720p@2Mbps, 480p@800kbps) + poster. Output: `processed/videos/<slug>/`.
- **`scripts/upload-video.js <slug>`** — Uploads processed video to S3 with correct MIME types and cache headers. Set `CF_DOMAIN` env var to override CloudFront domain.

### Re-encoding a video
```bash
# 1. Download original from S3 (or use local copy in raw/videos/)
aws s3 cp s3://seethroughlab-media/videos/<slug>/original.mp4 raw/videos/<slug>.mp4

# 2. Process
./scripts/process-video.sh raw/videos/<slug>.mp4 <slug>

# 3. Upload
node scripts/upload-video.js <slug>
```

### Frontend
`VideoPlayer.astro` detects `.m3u8` URLs and uses:
- Native HLS in Safari
- hls.js (loaded via CDN) in Chrome/Firefox

MDX frontmatter `videoSrc` field points to the CloudFront master playlist URL.
