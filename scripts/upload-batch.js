#!/usr/bin/env node
// Usage: node scripts/upload-batch.js <prefix>
// Example: node scripts/upload-batch.js one-hour-experiment
//
// Uploads all numbered subdirectories under processed/videos/<prefix>/
// (01/, 02/, ... 30/) to S3, reusing the same logic as upload-video.js.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname } from "path";

const BUCKET = "seethroughlab-media";
const REGION = "us-east-1";
const CF_DOMAIN = process.env.CF_DOMAIN || "d13tobysqmg65w.cloudfront.net";

const CONTENT_TYPES = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function getCacheControl(ext) {
  if (ext === ".m3u8") return "public, max-age=3600";
  return "public, max-age=31536000, immutable";
}

function walkDir(dir, prefix = "") {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const key = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      entries.push(...walkDir(full, key));
    } else {
      entries.push({ localPath: full, key });
    }
  }
  return entries;
}

async function main() {
  const prefix = process.argv[2];
  if (!prefix) {
    console.error("Usage: node scripts/upload-batch.js <prefix>");
    console.error("Example: node scripts/upload-batch.js one-hour-experiment");
    process.exit(1);
  }

  const baseDir = `processed/videos/${prefix}`;
  if (!existsSync(baseDir)) {
    console.error(`Error: directory not found: ${baseDir}`);
    process.exit(1);
  }

  // Find numbered subdirectories
  const subdirs = readdirSync(baseDir)
    .filter((name) => /^\d+$/.test(name))
    .filter((name) => statSync(join(baseDir, name)).isDirectory())
    .sort();

  if (subdirs.length === 0) {
    console.error(`Error: no numbered subdirectories found in ${baseDir}`);
    process.exit(1);
  }

  console.log(`Found ${subdirs.length} directories to upload under ${prefix}/`);

  const client = new S3Client({ region: REGION });
  const urls = [];

  for (const subdir of subdirs) {
    const localDir = join(baseDir, subdir);
    const s3Prefix = `videos/${prefix}/${subdir}`;
    const files = walkDir(localDir);

    console.log(`\nUploading ${subdir}/ (${files.length} files) → s3://${BUCKET}/${s3Prefix}/`);

    for (const { localPath, key } of files) {
      const ext = extname(key).toLowerCase();
      const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
      const cacheControl = getCacheControl(ext);
      const s3Key = `${s3Prefix}/${key}`;

      await client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: s3Key,
          Body: readFileSync(localPath),
          ContentType: contentType,
          CacheControl: cacheControl,
        })
      );
      console.log(`  ✓ ${s3Key} (${contentType})`);
    }

    urls.push(`https://${CF_DOMAIN}/videos/${prefix}/${subdir}/index.m3u8`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  UPLOAD COMPLETE — ${subdirs.length} directories`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\nCloudFront URLs (paste into MDX frontmatter):\n`);
  console.log("videos:");
  for (const url of urls) {
    console.log(`  - ${url}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
