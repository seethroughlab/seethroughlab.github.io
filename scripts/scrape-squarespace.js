#!/usr/bin/env node

/**
 * Squarespace scraper for seethroughlab.com
 * Extracts project content, downloads images, and generates MDX files.
 */

import { chromium } from 'playwright';
import fs from 'fs-extra';
import path from 'path';
import slugify from 'slugify';
import TurndownService from 'turndown';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://www.seethroughlab.com';
const CONTENT_DIR = path.join(ROOT, 'src', 'content', 'projects');
const IMAGES_DIR = path.join(ROOT, 'public', 'images', 'projects');
const REPORT_PATH = path.join(ROOT, 'migration-report.json');

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Strip Squarespace-specific elements
turndown.remove(['script', 'style', 'noscript', 'button']);

const report = {
  timestamp: new Date().toISOString(),
  projectsFound: 0,
  projectsScraped: 0,
  imagesDownloaded: 0,
  imagesFailed: 0,
  vimeoUrls: [],
  todos: [],
  errors: [],
};

function makeSlug(title) {
  return slugify(title, { lower: true, strict: true });
}

async function downloadImage(url, destPath) {
  // Ensure we get the best quality from Squarespace CDN
  let imageUrl = url;
  if (imageUrl.includes('squarespace-cdn.com') || imageUrl.includes('images.squarespace-cdn.com')) {
    // Request original format
    const u = new URL(imageUrl);
    u.searchParams.set('format', 'original');
    imageUrl = u.toString();
  }

  await fs.ensureDir(path.dirname(destPath));

  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith('https') ? https : http;
    const request = (url, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('Too many redirects'));
      protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return request(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const stream = fs.createWriteStream(destPath);
        res.pipe(stream);
        stream.on('finish', () => { stream.close(); resolve(); });
        stream.on('error', reject);
      }).on('error', reject);
    };
    request(imageUrl);
  });
}

function extractVimeoUrls(page) {
  return page.evaluate(() => {
    const urls = [];
    // Check iframes
    document.querySelectorAll('iframe').forEach((iframe) => {
      const src = iframe.src || iframe.getAttribute('data-src') || '';
      if (src.includes('vimeo.com') || src.includes('player.vimeo.com')) {
        urls.push(src);
      }
    });
    // Check embedded divs
    document.querySelectorAll('[data-url*="vimeo"], [data-src*="vimeo"]').forEach((el) => {
      const url = el.getAttribute('data-url') || el.getAttribute('data-src');
      if (url) urls.push(url);
    });
    return urls;
  });
}

async function scrapeProjectPage(page, url, index) {
  console.log(`  Scraping: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for content to render
  await page.waitForTimeout(2000);

  // Extract title
  const title = await page.evaluate(() => {
    // Try various Squarespace title selectors
    const selectors = [
      'h1.project-title',
      'h1.portfolio-title',
      '.ProjectItem-title h1',
      '.project-header h1',
      'article h1',
      'h1',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  });

  if (!title) {
    console.warn(`    Warning: No title found at ${url}`);
    report.errors.push({ url, error: 'No title found' });
    return null;
  }

  const slug = makeSlug(title);
  console.log(`    Title: "${title}" → ${slug}`);

  // Extract Vimeo URLs
  const vimeoUrls = await extractVimeoUrls(page);
  if (vimeoUrls.length > 0) {
    console.log(`    Found ${vimeoUrls.length} Vimeo URL(s)`);
    report.vimeoUrls.push({ project: title, slug, urls: vimeoUrls });
  }

  // Extract body content
  const bodyHtml = await page.evaluate(() => {
    // Try to find the main content area
    const selectors = [
      '.project-description',
      '.ProjectItem-description',
      '.portfolio-text',
      '.sqs-layout',
      'article .sqs-block-content',
      '.entry-content',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerHTML.trim().length > 20) return el.innerHTML;
    }
    // Fallback: grab all text blocks
    const blocks = document.querySelectorAll('.sqs-block-html .sqs-block-content');
    if (blocks.length > 0) {
      return Array.from(blocks).map((b) => b.innerHTML).join('\n\n');
    }
    return '';
  });

  const bodyMarkdown = bodyHtml ? turndown.turndown(bodyHtml).trim() : '';

  // Extract images
  const imageUrls = await page.evaluate(() => {
    const imgs = new Set();
    // Standard images
    document.querySelectorAll('img[src], img[data-src]').forEach((img) => {
      const src = img.getAttribute('data-src') || img.src;
      if (src && !src.includes('favicon') && !src.includes('logo') && !src.startsWith('data:')) {
        imgs.add(src);
      }
    });
    // Squarespace background images
    document.querySelectorAll('[data-image-id]').forEach((el) => {
      const src = el.getAttribute('data-image') || el.querySelector('img')?.src;
      if (src) imgs.add(src);
    });
    // Squarespace gallery images
    document.querySelectorAll('.gallery-grid img, .sqs-gallery img').forEach((img) => {
      const src = img.getAttribute('data-src') || img.src;
      if (src && !src.startsWith('data:')) imgs.add(src);
    });
    return [...imgs];
  });

  // Download images
  const imageDir = path.join(IMAGES_DIR, slug);
  const downloadedImages = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const ext = path.extname(new URL(imageUrls[i]).pathname).split('?')[0] || '.jpg';
    const filename = `${slug}-${String(i + 1).padStart(2, '0')}${ext}`;
    const destPath = path.join(imageDir, filename);
    try {
      await downloadImage(imageUrls[i], destPath);
      downloadedImages.push(`/images/projects/${slug}/${filename}`);
      report.imagesDownloaded++;
      console.log(`    Downloaded: ${filename}`);
    } catch (err) {
      console.warn(`    Failed to download: ${imageUrls[i]} — ${err.message}`);
      report.imagesFailed++;
      report.errors.push({ project: title, image: imageUrls[i], error: err.message });
    }
  }

  const coverImage = downloadedImages[0] || '';

  // Extract any metadata hints (client, year) from page text
  const metaHints = await page.evaluate(() => {
    const text = document.body.innerText;
    // Look for year patterns like 2018, 2019, etc.
    const yearMatch = text.match(/\b(20[12]\d)\b/);
    return {
      possibleYear: yearMatch ? parseInt(yearMatch[1]) : null,
    };
  });

  // Generate MDX
  const frontmatter = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `slug: "${slug}"`,
    `client: "" # TODO: add client`,
    metaHints.possibleYear
      ? `year: ${metaHints.possibleYear} # TODO: verify`
      : `year: 2020 # TODO: add year`,
    `tags: [] # TODO: add tags`,
    `coverImage: "${coverImage}"`,
    `videoSrc: ""${vimeoUrls.length > 0 ? ` # Vimeo: ${vimeoUrls[0]}` : ''}`,
    `featured: false`,
    `order: ${index + 1}`,
    `role: "" # TODO: add role`,
    `tech: [] # TODO: add tech`,
    '---',
  ].join('\n');

  const mdxContent = `${frontmatter}\n\n{/* Scraped from ${url} — review and clean up */}\n\n${bodyMarkdown}\n`;

  const mdxPath = path.join(CONTENT_DIR, `${slug}.mdx`);
  await fs.ensureDir(CONTENT_DIR);
  await fs.writeFile(mdxPath, mdxContent, 'utf-8');

  report.projectsScraped++;
  report.todos.push({
    project: title,
    slug,
    fields: ['client', 'year', 'tags', 'role', 'tech', ...(vimeoUrls.length > 0 ? ['videoSrc'] : [])],
  });

  return { title, slug, url, images: downloadedImages.length, vimeoUrls };
}

async function main() {
  console.log('Starting Squarespace scraper for seethroughlab.com\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Step 1: Find all project links from homepage
  console.log('Crawling homepage for project links...');
  await page.goto(SITE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const projectLinks = await page.evaluate((siteUrl) => {
    const links = new Set();
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.href;
      // Match project-like URLs
      if (
        href.includes('/projects/') ||
        href.includes('/portfolio/') ||
        href.includes('/work/') ||
        (href.startsWith(siteUrl) && !href.includes('/about') && !href.includes('/contact') && !href.includes('/research') && href !== siteUrl && href !== siteUrl + '/')
      ) {
        links.add(href);
      }
    });
    return [...links];
  }, SITE);

  // Also check if there's a /work or /projects index page
  for (const indexPath of ['/work', '/projects', '/portfolio']) {
    try {
      await page.goto(`${SITE}${indexPath}`, { waitUntil: 'networkidle', timeout: 15000 });
      const moreLinks = await page.evaluate((siteUrl) => {
        const links = new Set();
        document.querySelectorAll('a[href]').forEach((a) => {
          const href = a.href;
          if (href.startsWith(siteUrl) && href !== siteUrl && !href.endsWith(siteUrl + '/')) {
            links.add(href);
          }
        });
        return [...links];
      }, SITE);
      moreLinks.forEach((l) => {
        if (!projectLinks.includes(l)) projectLinks.push(l);
      });
    } catch {
      // Page doesn't exist, skip
    }
  }

  // Filter to unique project-like URLs (not nav pages)
  const skipPatterns = ['/about', '/contact', '/research', '/lab', '/cart', '/search', '/account', '/#', '/blog'];
  const uniqueLinks = [...new Set(projectLinks)].filter(
    (url) => !skipPatterns.some((p) => url.includes(p)) && url !== SITE && url !== SITE + '/'
  );

  console.log(`Found ${uniqueLinks.length} project links:\n`);
  uniqueLinks.forEach((l) => console.log(`  ${l}`));
  console.log();

  report.projectsFound = uniqueLinks.length;

  // Step 2: Scrape each project
  const results = [];
  for (let i = 0; i < uniqueLinks.length; i++) {
    console.log(`\n[${i + 1}/${uniqueLinks.length}]`);
    try {
      const result = await scrapeProjectPage(page, uniqueLinks[i], i);
      if (result) results.push(result);
    } catch (err) {
      console.error(`  Error scraping ${uniqueLinks[i]}: ${err.message}`);
      report.errors.push({ url: uniqueLinks[i], error: err.message });
    }
  }

  // Step 3: Scrape /about for reference
  console.log('\nScraping /about page...');
  try {
    await page.goto(`${SITE}/about`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const aboutHtml = await page.evaluate(() => {
      const content = document.querySelector('.sqs-layout, main, article, .page-section');
      return content ? content.innerHTML : document.body.innerHTML;
    });
    const aboutMd = turndown.turndown(aboutHtml);
    await fs.writeFile(path.join(ROOT, 'raw', 'about-reference.md'), aboutMd, 'utf-8');
    console.log('  Saved about page reference text');
  } catch (err) {
    console.warn(`  Failed to scrape /about: ${err.message}`);
    report.errors.push({ page: '/about', error: err.message });
  }

  // Write migration report
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  await browser.close();

  console.log('\n=== Migration Report ===');
  console.log(`Projects found: ${report.projectsFound}`);
  console.log(`Projects scraped: ${report.projectsScraped}`);
  console.log(`Images downloaded: ${report.imagesDownloaded}`);
  console.log(`Images failed: ${report.imagesFailed}`);
  console.log(`Vimeo URLs found: ${report.vimeoUrls.length}`);
  console.log(`Errors: ${report.errors.length}`);
  console.log(`\nReport saved to: ${REPORT_PATH}`);
  console.log('Review TODO fields in each MDX file.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
