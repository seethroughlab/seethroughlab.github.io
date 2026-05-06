#!/usr/bin/env node
/**
 * Extracts credits and links from legacy Jekyll _posts/* on the `legacy` git branch
 * and writes structured `credits:` and `links:` frontmatter into the current MDX files.
 *
 * Usage:
 *   node scripts/restore-legacy-meta.mjs           # apply changes
 *   node scripts/restore-legacy-meta.mjs --dry-run # preview only
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// ── Legacy post → current MDX slug mapping ───────────────────────────────────
const MAPPING = [
  ['_posts/2015-04-23-acer-predator.md',            'acer-predator'],
  ['_posts/2015-06-10-edge-of-the-universe.md',     'edge-of-the-universe'],
  ['_posts/2015-06-26-light-echoes.md',             'light-echoes'],
  ['_posts/2015-10-05-photoland.md',                'photoland-hermes'],
  ['_posts/2015-11-22-huit-phases.md',              'huit-phases-de-lillumination'],
  ['_posts/2016-02-15-delta-ascend.md',             'delta-ascend'],
  ['_posts/2016-05-13-endec.md',                    'endec'],
  ['_posts/2016-06-15-tv-transports.md',            'samsung-tv-transports'],
  ['_posts/2016-09-19-driven-by-emotion.md',        'driven-by-emotion'],
  ['_posts/2016-10-12-litcar.md',                   'litcar'],
  ['_posts/2017-04-12-samedi-ar.md',                'baron-samedi'],
  ['_posts/2017-06-02-samedi-mr.md',                'baron-samedi'],   // merged
  ['_posts/2017-11-20-one-time-in-new-orleans.md',  'one-time-in-new-orleans'],
  ['_posts/2018-01-09-intel-ces-2018.md',           'intel-mega-experience'],
  ['_posts/2018-03-09-pandora-sounds-like-you.md',  'pandora-sounds-like-you'],
  ['_posts/2019-01-23-permajersey.md',              'permajersey'],
  ['_posts/2019-07-25-fila-explorer-canyon.md',     'fila-explorer-canyon'],
  ['_posts/2020-11-02-citizen-browser.md',          'citizen-browser'],
  ['_posts/2022-03-11-accenture-austin.md',         'accenture-interactive-window'],
  ['_posts/2022-05-25-pierre-huyghe-offspring.md',  'pierre-huyghe-offspring-exhibition'],
  ['_posts/2022-06-15-dell-moody-center.md',        'dell-club-interactive-wall'],
];

// ── HTML helpers ──────────────────────────────────────────────────────────────

function parseHtml(raw) {
  const s = String(raw ?? '').trim();
  const href = s.match(/href=["']([^"']+)["']/)?.[1];
  const text = s.replace(/<[^>]+>/g, '').trim();
  return { name: text, url: href };
}

// ── Credits/links extraction ──────────────────────────────────────────────────

function extractCredits(fm) {
  const raw = fm.credits;
  if (!Array.isArray(raw)) return [];
  const results = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    for (const [role, val] of Object.entries(entry)) {
      const { name, url } = parseHtml(val);
      if (name) results.push({ role, name, ...(url ? { url } : {}) });
    }
  }
  return results;
}

function extractLinks(fm) {
  const raw = fm.links;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseHtml)
    .filter(({ name, url }) => name && url)
    .map(({ name, url }) => ({ label: name, url }));
}

// ── MDX serialization ─────────────────────────────────────────────────────────

function serializeCredits(credits) {
  if (!credits.length) return '';
  const lines = ['credits:'];
  for (const { role, name, url } of credits) {
    lines.push(`  - role: ${JSON.stringify(role)}`);
    lines.push(`    name: ${JSON.stringify(name)}`);
    if (url) lines.push(`    url: ${JSON.stringify(url)}`);
  }
  return lines.join('\n');
}

function serializeLinks(links) {
  if (!links.length) return '';
  const lines = ['links:'];
  for (const { label, url } of links) {
    lines.push(`  - label: ${JSON.stringify(label)}`);
    lines.push(`    url: ${JSON.stringify(url)}`);
  }
  return lines.join('\n');
}

function injectIntoMdx(mdxContent, credits, links) {
  // Find the frontmatter block (between first and second ---)
  const fmEnd = mdxContent.indexOf('\n---', 3);
  if (fmEnd === -1) return mdxContent;

  let fm = mdxContent.slice(0, fmEnd);
  const body = mdxContent.slice(fmEnd);

  // Remove any existing credits/links blocks
  fm = fm.replace(/\ncredits:[\s\S]*?(?=\n[a-zA-Z_]|\n---$|$)/m, '');
  fm = fm.replace(/\nlinks:[\s\S]*?(?=\n[a-zA-Z_]|\n---$|$)/m, '');
  fm = fm.replace(/\n{3,}/g, '\n\n').trimEnd();

  const toInsert = [
    credits.length ? serializeCredits(credits) : '',
    links.length ? serializeLinks(links) : '',
  ].filter(Boolean).join('\n');

  return fm + (toInsert ? '\n' + toInsert : '') + body;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const accumulated = {};

for (const [legacyPath, slug] of MAPPING) {
  let raw;
  try {
    raw = execSync(`git show legacy:${legacyPath}`, { cwd: ROOT }).toString();
  } catch {
    console.warn(`  SKIP (not found in legacy): ${legacyPath}`);
    continue;
  }

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) { console.warn(`  SKIP (no frontmatter): ${legacyPath}`); continue; }

  let fm;
  try { fm = yaml.load(fmMatch[1]); } catch (e) {
    console.warn(`  SKIP (yaml error in ${legacyPath}): ${e.message}`);
    continue;
  }

  if (!accumulated[slug]) accumulated[slug] = { credits: [], links: [] };
  accumulated[slug].credits.push(...extractCredits(fm));
  accumulated[slug].links.push(...extractLinks(fm));
}

// Deduplicate by role+name (for merged legacy entries like baron-samedi)
for (const data of Object.values(accumulated)) {
  const seen = new Set();
  data.credits = data.credits.filter(({ role, name }) => {
    const key = `${role}|${name}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

// Apply to MDX files
for (const [slug, { credits, links }] of Object.entries(accumulated)) {
  if (!credits.length && !links.length) continue;

  const mdxPath = resolve(ROOT, `src/content/projects/${slug}.mdx`);
  let mdxContent;
  try { mdxContent = readFileSync(mdxPath, 'utf8'); } catch {
    console.warn(`  SKIP (MDX not found): ${slug}.mdx`);
    continue;
  }

  if (DRY_RUN) {
    console.log(`\n── ${slug} ──`);
    credits.forEach(c => console.log(`  CREDIT  ${c.role}: ${c.name}${c.url ? ' → ' + c.url : ''}`));
    links.forEach(l => console.log(`  LINK    ${l.label} → ${l.url}`));
  } else {
    const updated = injectIntoMdx(mdxContent, credits, links);
    writeFileSync(mdxPath, updated, 'utf8');
    console.log(`  ✓ ${slug} — ${credits.length} credits, ${links.length} links`);
  }
}

console.log('\nDone.');
