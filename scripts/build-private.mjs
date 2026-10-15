#!/usr/bin/env node
// Usage: node scripts/build-private.mjs
//
// Builds every project marked `private: true` and publishes it as a
// password-protected page. GitHub Pages has no server-side auth and this repo
// is public, so:
//   - the private .mdx and its images are gitignored (never pushed);
//   - this script renders the page locally, inlines its CSS and local images,
//     encrypts the <main> content (AES-GCM, key from PBKDF2-SHA256), and writes
//     public/projects/<slug>/index.html, which is the only thing committed.
// The page decrypts in the browser with the password.
//
// Password: PRIVATE_PAGE_PASSWORD env var, else the gitignored .private-password file.
//
// To make a project public: remove `private: true`, delete its line in
// .gitignore and public/projects/<slug>/, then commit the .mdx and images.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';

const ROOT = process.cwd();
const ITERATIONS = 600000;
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const password = process.env.PRIVATE_PAGE_PASSWORD
  || (existsSync('.private-password') && readFileSync('.private-password', 'utf8').trim());
if (!password) {
  console.error('No password: set PRIVATE_PAGE_PASSWORD or create .private-password');
  process.exit(1);
}

const projectDir = join(ROOT, 'src/content/projects');
const slugs = readdirSync(projectDir)
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => readFileSync(join(projectDir, f), 'utf8'))
  .filter((src) => /^private:\s*true\s*$/m.test(src.split(/^---$/m)[1] || ''))
  .map((src) => src.match(/^slug:\s*"?([^"\n]+)"?\s*$/m)[1]);

if (slugs.length === 0) {
  console.log('No private projects.');
  process.exit(0);
}

// Move previous encrypted pages aside so they don't collide with the routes being built
const aside = slugs
  .map((slug) => [join(ROOT, 'public/projects', slug), join(ROOT, `.private-aside-${slug}`)])
  .filter(([from]) => existsSync(from));
for (const [from, to] of aside) renameSync(from, to);

try {
  execSync('npx astro build', { stdio: 'inherit', env: { ...process.env, INCLUDE_PRIVATE: '1' } });
} catch (err) {
  for (const [from, to] of aside) renameSync(to, from);
  throw err;
}
for (const [, to] of aside) rmSync(to, { recursive: true });

const b64 = (buf) => Buffer.from(buf).toString('base64');

async function encrypt(text) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  );
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { s: b64(salt), i: b64(iv), c: b64(ct), n: ITERATIONS };
}

function inlineLocalImages(html, slug) {
  return html.replace(/(src|poster)="(\/images\/projects\/[^"]+)"/g, (m, attr, path) => {
    const file = join(ROOT, 'public', path);
    const type = MIME[extname(file).toLowerCase()];
    if (!type || !existsSync(file)) throw new Error(`Cannot inline ${path} for ${slug}`);
    return `${attr}="data:${type};base64,${readFileSync(file).toString('base64')}"`;
  });
}

const GATE = `
<div id="private-gate" class="py-24 max-w-sm mx-auto text-center">
  <p class="text-xs uppercase tracking-widest text-text-muted mb-6">Private project</p>
  <form id="private-form" class="flex flex-col gap-4">
    <input id="private-password" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password" required
      style="background:transparent;border:1px solid #333;border-radius:9999px;padding:0.6rem 1.1rem;color:#fff;text-align:center;font:inherit">
    <button type="submit" class="text-sm uppercase tracking-widest text-text-muted border border-border px-4 py-2 rounded-full hover:text-text-primary transition-colors duration-200" style="cursor:pointer">Unlock</button>
    <p id="private-error" class="text-sm text-text-muted" style="visibility:hidden">Wrong password.</p>
  </form>
</div>`;

const UNLOCK = (payload) => `
<script>
(() => {
  const P = ${JSON.stringify(payload)};
  const KEY = 'private-pw:' + location.pathname;
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function unlock(pw) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(P.s), iterations: P.n, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const html = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(P.i) }, key, bytes(P.c)));
    const main = document.querySelector('main');
    main.innerHTML = html;
    // innerHTML doesn't run scripts; recreate them so the video player initialises
    main.querySelectorAll('script').forEach((old) => {
      const s = document.createElement('script');
      for (const a of old.attributes) s.setAttribute(a.name, a.value);
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
    try { sessionStorage.setItem(KEY, pw); } catch {}
  }
  const form = document.getElementById('private-form');
  const input = document.getElementById('private-password');
  const error = document.getElementById('private-error');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    error.style.visibility = 'hidden';
    unlock(input.value).catch(() => { error.style.visibility = 'visible'; input.select(); });
  });
  let saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch {}
  if (saved) unlock(saved).catch(() => { try { sessionStorage.removeItem(KEY); } catch {} });
})();
</script>`;

for (const slug of slugs) {
  let html = readFileSync(join(ROOT, 'dist/projects', slug, 'index.html'), 'utf8');

  // Head: neutral title, no description or social previews, keep out of search engines
  html = html
    .replace(/<title>[^<]*<\/title>/, '<title>Private | See Through Lab</title><meta name="robots" content="noindex, nofollow">')
    .replace(/<meta (name="description"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*>/g, '');

  // Inline the stylesheet (the hashed CSS from this local build won't exist in CI's build)
  html = html.replace(/<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)">/g, (m, href) =>
    `<style>${readFileSync(join(ROOT, 'dist', href), 'utf8')}</style>`);
  if (/\/_astro\//.test(html)) throw new Error(`${slug}: page still references /_astro/ assets`);

  const mainMatch = html.match(/(<main[^>]*>)([\s\S]*)(<\/main>)/);
  if (!mainMatch) throw new Error(`${slug}: no <main>`);
  const secret = inlineLocalImages(mainMatch[2], slug);
  const payload = await encrypt(secret);
  html = html.replace(mainMatch[0], () => mainMatch[1] + GATE + mainMatch[3] + UNLOCK(payload));

  const outDir = join(ROOT, 'public/projects', slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html);
  console.log(`Encrypted → public/projects/${slug}/index.html`);
}
