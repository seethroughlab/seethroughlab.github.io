import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PROJECTS_DIR = 'src/content/projects';

const MONTHS = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
  'jan','feb','mar','apr','jun','jul','aug','sep','oct','nov','dec',
];

// Match month + year in various formats:
//   **SEPTEMBER 2024**, **May 2023**, May 2022, Jun 2015, ### Jun 2015, **Jan 2019**, etc.
const DATE_RE = new RegExp(
  `^(?:#{1,4}\\s*)?(?:\\*{0,3}_?)?(${MONTHS.join('|')})(?:uary|ruary|ch|il|e|ust|tember|ober|ember)?\\s+(\\d{4})(?:_?\\*{0,3})?$`,
  'im'
);

// Also handle the "**Date\n**Jan 2018" variant (intel-mega-experience)
const DATE_LABEL_RE = /\*{2,3}_?Date\s*\n_?\*{2,3}_?\s*(?:\*{0,3}_?)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/im;

/** Strip markdown bold/italic and links, keeping display text */
function stripMarkdown(str) {
  // Strip markdown links: [text](url) -> text
  str = str.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Strip bold/italic markers
  str = str.replace(/\*{1,3}/g, '').replace(/_{1,3}/g, '');
  return str.trim();
}

/** Extract link display text from markdown link */
function linkDisplayText(str) {
  return str.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

/**
 * Given a body section, extract a metadata field value.
 * Handles multiple formatting variants:
 *   **Label**\ncontent
 *   **Label\n**content
 *   ### Label\ncontent
 *   ### **Label**\ncontent
 *   Label\ncontent (plain)
 *   * **_Label_**_content_ (inline list-item variant)
 */
function extractSection(body, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Variant: list-item inline (driven-by-emotion style)
  //   * **_Label_**_content_
  //   * **_Label_**content
  const listInlineRe = new RegExp(
    `\\*\\s+\\*{2,3}_?${escapedLabel}_?\\*{2,3}_?(.+?)(?=\\n\\s*\\*\\s+\\*{2,3}_?\\w|$)`,
    'is'
  );
  const listInlineMatch = body.match(listInlineRe);
  if (listInlineMatch) {
    return { value: stripMarkdown(listInlineMatch[1]).trim(), raw: listInlineMatch[0] };
  }

  // Variant A: **Label\n** or **_Label\n_** (closing markers on next line)
  const variantARe = new RegExp(
    `\\*{2,3}_?${escapedLabel}\\s*\\n_?\\*{2,3}(.+?)(?=\\n\\n|\\n\\*{2,3}|\\n#{1,4}\\s|$)`,
    'is'
  );
  const matchA = body.match(variantARe);
  if (matchA) {
    return { value: stripMarkdown(matchA[1]).trim(), raw: matchA[0] };
  }

  // Variant B: **Label** or ### **Label** or ### Label (standard)
  const variantBRe = new RegExp(
    `(?:#{1,4}\\s*)?\\*{0,3}_?${escapedLabel}_?\\*{0,3}\\s*(?:\\\\)?\\n(.+?)(?=\\n\\n|\\n(?:#{1,4}\\s)?\\*{0,3}_?(?:Role|Client|Tech|Credits|Links|Date)_?\\*{0,3}|$)`,
    'is'
  );
  const matchB = body.match(variantBRe);
  if (matchB) {
    return { value: matchB[1].trim(), raw: matchB[0] };
  }

  // Variant C: Label on its own line (plain, no markdown) followed by content
  // e.g., "Role  \nTechnical Director"
  const variantCRe = new RegExp(
    `^${escapedLabel}\\s*(?:\\\\)?\\n(.+?)(?=\\n\\n|\\n(?:Role|Client|Tech|Credits|Links)\\s|$)`,
    'im'
  );
  const matchC = body.match(variantCRe);
  if (matchC) {
    return { value: matchC[1].trim(), raw: matchC[0] };
  }

  return null;
}

/** Parse tech items from raw tech section text */
function parseTechItems(raw) {
  // Strip markdown formatting from the raw text
  let text = raw;

  // Remove list markers (* or numbered 1. 2. etc.)
  text = text.replace(/^\s*(?:\*|\d+\.)\s+/gm, '');

  // Strip markdown links -> keep display text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Strip bold/italic
  text = text.replace(/\*{1,3}/g, '').replace(/_{1,3}/g, '');

  // Split by newlines (after cleanup) - each line is an item or part of one
  let lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // If there's only one line, try comma-separated (respecting parentheses)
  if (lines.length === 1) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of lines[0]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    if (parts.length > 1) return parts;
    return [lines[0]];
  }

  // Merge lines that look like continuations (don't start with a recognizable item)
  const items = [];
  for (const line of lines) {
    // Clean up quantity prefixes like "3x", "4x", "6x"
    const cleaned = line.replace(/^\d+x\s+/i, '').trim();
    if (cleaned) items.push(cleaned);
  }

  return items;
}

/** Extract year from a date string */
function extractYear(body) {
  // Try the labeled "Date" variant first (intel-mega-experience)
  const dateLabelMatch = body.match(DATE_LABEL_RE);
  if (dateLabelMatch) {
    return { year: parseInt(dateLabelMatch[2]), raw: dateLabelMatch[0] };
  }

  // Try standalone month + year line
  const dateMatch = body.match(DATE_RE);
  if (dateMatch) {
    return { year: parseInt(dateMatch[2]), raw: dateMatch[0] };
  }

  return null;
}

/** Build a complete regex to find and remove a section from body text */
function buildSectionRemovalPattern(body, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Try all the same variants as extractSection, but return a pattern that matches the full block

  // List-item inline
  const listInlineRe = new RegExp(
    `\\n?\\s*\\*\\s+\\*{2,3}_?${escapedLabel}_?\\*{2,3}_?(.+?)(?=\\n\\s*\\*\\s+\\*{2,3}_?\\w|$)`,
    'is'
  );
  if (listInlineRe.test(body)) return listInlineRe;

  // **Label\n**content (variant A)
  const variantARe = new RegExp(
    `\\n?\\*{2,3}_?${escapedLabel}\\s*\\n_?\\*{2,3}(.+?)(?=\\n\\n|\\n\\*{2,3}|\\n#{1,4}\\s|$)`,
    'is'
  );
  if (variantARe.test(body)) return variantARe;

  // Standard **Label** or ### Label heading
  const variantBRe = new RegExp(
    `\\n?(?:#{1,4}\\s*)?\\*{0,3}_?${escapedLabel}_?\\*{0,3}\\s*(?:\\\\)?\\n(.+?)(?=\\n\\n|\\n(?:#{1,4}\\s)?\\*{0,3}_?(?:Role|Client|Tech|Credits|Links|Date)_?\\*{0,3}|$)`,
    'is'
  );
  if (variantBRe.test(body)) return variantBRe;

  // Plain label
  const variantCRe = new RegExp(
    `\\n?^${escapedLabel}\\s*(?:\\\\)?\\n(.+?)(?=\\n\\n|\\n(?:Role|Client|Tech|Credits|Links)\\s|$)`,
    'im'
  );
  if (variantCRe.test(body)) return variantCRe;

  return null;
}

async function processFile(filepath) {
  const content = await readFile(filepath, 'utf-8');
  const result = { file: filepath.split('/').pop(), extracted: {}, warnings: [] };

  // Split frontmatter and body
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    result.warnings.push('Could not parse frontmatter');
    return result;
  }

  let frontmatter = fmMatch[1];
  let body = fmMatch[2];

  // --- Extract metadata from body ---

  // Year
  const yearResult = extractYear(body);
  if (yearResult) {
    result.extracted.year = yearResult.year;
  }

  // Role
  const roleResult = extractSection(body, 'Role');
  if (roleResult) {
    result.extracted.role = stripMarkdown(roleResult.value.split('\n')[0]);
  }

  // Client
  const clientResult = extractSection(body, 'Client');
  if (clientResult) {
    const clientText = clientResult.value.split('\n')[0];
    result.extracted.client = stripMarkdown(clientText);
  }

  // Tech
  const techResult = extractSection(body, 'Tech');
  if (techResult) {
    result.extracted.tech = parseTechItems(techResult.value);
  }

  // --- Update frontmatter ---

  // Update client
  if (result.extracted.client) {
    frontmatter = frontmatter.replace(
      /^client:.*$/m,
      `client: "${result.extracted.client.replace(/"/g, '\\"')}"`
    );
  } else {
    // Just strip the TODO comment
    frontmatter = frontmatter.replace(/^(client:.*?)#\s*TODO.*$/m, '$1'.trimEnd());
  }

  // Update year
  if (result.extracted.year) {
    frontmatter = frontmatter.replace(
      /^year:.*$/m,
      `year: ${result.extracted.year}`
    );
  } else {
    frontmatter = frontmatter.replace(/^(year:.*?)#\s*TODO.*$/m, '$1'.trimEnd());
  }

  // Update role
  if (result.extracted.role) {
    frontmatter = frontmatter.replace(
      /^role:.*$/m,
      `role: "${result.extracted.role.replace(/"/g, '\\"')}"`
    );
  } else {
    frontmatter = frontmatter.replace(/^(role:.*?)#\s*TODO.*$/m, '$1'.trimEnd());
  }

  // Update tech
  if (result.extracted.tech && result.extracted.tech.length > 0) {
    const techYaml = result.extracted.tech
      .map(t => `  - "${t.replace(/"/g, '\\"')}"`)
      .join('\n');
    frontmatter = frontmatter.replace(
      /^tech:.*$/m,
      `tech:\n${techYaml}`
    );
  } else {
    frontmatter = frontmatter.replace(/^(tech:.*?)#\s*TODO.*$/m, '$1'.trimEnd());
  }

  // Update tags - keep empty array, just strip TODO
  frontmatter = frontmatter.replace(/^(tags:.*?)#\s*TODO.*$/m, '$1'.trimEnd());

  // Trim trailing whitespace from each frontmatter line
  frontmatter = frontmatter.split('\n').map(l => l.trimEnd()).join('\n');

  // --- Clean up body text ---

  // Remove scraped comment
  body = body.replace(/\{\/\*\s*Scraped from.*?\*\/\}\n*/g, '');

  // Remove duplicate heading matching title
  const titleMatch = frontmatter.match(/^title:\s*"(.+)"$/m);
  if (titleMatch) {
    const titleEscaped = titleMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match # Title or ## Title etc (with optional bold/italic)
    body = body.replace(new RegExp(`^#{1,4}\\s*(?:\\*{0,3}_?)?${titleEscaped}(?:_?\\*{0,3})?\\s*\\n`, 'im'), '');
  }

  // Remove metadata sections from body
  for (const label of ['Role', 'ROLE', 'Client', 'Tech', 'Credits', 'Links', 'Date']) {
    const pattern = buildSectionRemovalPattern(body, label);
    if (pattern) {
      body = body.replace(pattern, '');
    }
  }

  // Remove inline list metadata block (driven-by-emotion style)
  // Pattern: lines starting with * that contain bold+italic labels
  body = body.replace(/(\n\s*\*\s+\*{2,3}_?(?:Role|Client|Tech|Credits|Links)_?\*{2,3}.*?(?=\n\n|$))+/gis, '');

  // Remove date lines (standalone month + year)
  if (yearResult) {
    const dateEscaped = yearResult.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    body = body.replace(new RegExp(`\\n?${dateEscaped}\\s*\\n?`), '');
  }

  // Remove italic title line like **_Driven By Emotion_**
  if (titleMatch) {
    const titleEscaped = titleMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    body = body.replace(new RegExp(`\\*{2,3}_${titleEscaped}_\\*{2,3}\\s*\\n?`), '');
  }

  // Remove video player artifacts
  body = body.replace(/\d{2}:\d{2}\n/g, '');
  body = body.replace(/%\s*buffered\d*:?\d*\n?/g, '');

  // Remove "Links" that are internal self-references to other projects on the site
  body = body.replace(/\[(?:INTEL MEGA EXPERIENCE|PERMAJERSEY)\]\(https:\/\/seethroughlab\.com\/projects\/[^)]+\)\s*\n?/g, '');

  // Collapse 3+ consecutive blank lines to 2
  body = body.replace(/\n{3,}/g, '\n\n');

  // Trim leading/trailing whitespace
  body = body.trim();

  // --- Reassemble file ---
  const newContent = `---\n${frontmatter}\n---\n\n${body}\n`;

  await writeFile(filepath, newContent, 'utf-8');

  return result;
}

async function main() {
  const files = (await readdir(PROJECTS_DIR))
    .filter(f => f.endsWith('.mdx'))
    .sort();

  console.log(`Processing ${files.length} MDX files...\n`);

  const results = [];
  for (const file of files) {
    const filepath = join(PROJECTS_DIR, file);
    const result = await processFile(filepath);
    results.push(result);
  }

  // Print summary
  console.log('='.repeat(80));
  console.log('ENRICHMENT SUMMARY');
  console.log('='.repeat(80));

  let totalExtracted = { year: 0, role: 0, client: 0, tech: 0 };
  let needsAttention = [];

  for (const r of results) {
    const fields = Object.keys(r.extracted);
    const missing = ['year', 'role', 'client', 'tech'].filter(f => !fields.includes(f));

    const icon = missing.length === 0 ? '✓' : '!';
    const extracted = fields.map(f => {
      const val = r.extracted[f];
      if (Array.isArray(val)) return `${f}=[${val.length} items]`;
      return `${f}=${val}`;
    }).join(', ');

    console.log(`${icon} ${r.file}`);
    if (extracted) console.log(`  extracted: ${extracted}`);
    if (missing.length) console.log(`  MISSING: ${missing.join(', ')}`);
    if (r.warnings.length) console.log(`  WARNINGS: ${r.warnings.join(', ')}`);

    for (const f of fields) totalExtracted[f]++;
    if (missing.length) needsAttention.push({ file: r.file, missing });
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Totals: year=${totalExtracted.year}/${files.length}, role=${totalExtracted.role}/${files.length}, client=${totalExtracted.client}/${files.length}, tech=${totalExtracted.tech}/${files.length}`);

  if (needsAttention.length) {
    console.log(`\n${needsAttention.length} files need manual attention:`);
    for (const { file, missing } of needsAttention) {
      console.log(`  ${file}: ${missing.join(', ')}`);
    }
  }
}

main().catch(console.error);
