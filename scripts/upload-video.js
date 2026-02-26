#!/usr/bin/env node
// Usage: node scripts/upload-video.js <slug>
// Uploads processed/videos/<slug>/ to S3 with correct content types and cache headers.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const BUCKET = "seethroughlab-media";
const REGION = "us-east-1";
// Set this to your CloudFront distribution domain after creation
const CF_DOMAIN = process.env.CF_DOMAIN || "d13tobysqmg65w.cloudfront.net";

const CONTENT_TYPES = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function getCacheControl(ext) {
  // Playlists change if we re-encode; segments are immutable
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
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: node scripts/upload-video.js <slug>");
    process.exit(1);
  }

  const localDir = `processed/videos/${slug}`;
  const s3Prefix = `videos/${slug}`;

  const client = new S3Client({ region: REGION });
  const files = walkDir(localDir);

  console.log(`Uploading ${files.length} files from ${localDir} → s3://${BUCKET}/${s3Prefix}/`);

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

  console.log(`\nDone! Video URL:`);
  console.log(`  https://${CF_DOMAIN}/videos/${slug}/index.m3u8`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
