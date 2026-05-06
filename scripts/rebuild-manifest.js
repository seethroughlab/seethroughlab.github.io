#!/usr/bin/env node

import { ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { basename } from "path";
import slugify from "slugify";

const BUCKET = "seethroughlab-media";
const REGION = "us-east-1";
const CF_DOMAIN = process.env.CF_DOMAIN || "d13tobysqmg65w.cloudfront.net";
const PREFIX = "bts/";

function titleFromFilename(filename) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function yearFromFilename(filename) {
  const m = filename.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : undefined;
}

export async function rebuildManifest() {
  const client = new S3Client({ region: REGION });

  const keys = [];
  let token;
  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: PREFIX,
        ...(token ? { ContinuationToken: token } : {}),
      }),
    );
    for (const obj of resp.Contents ?? []) {
      if (obj.Key.toLowerCase().endsWith(".mp4")) keys.push(obj.Key);
    }
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);

  keys.sort((a, b) => a.localeCompare(b));
  console.log(`Found ${keys.length} MP4s in s3://${BUCKET}/${PREFIX}`);

  const seenIds = new Set();
  const manifest = [];

  for (const key of keys) {
    const filename = basename(key);
    const id = slugify(filename.replace(/\.[^.]+$/, ""), { lower: true, strict: true });
    if (!id) { console.warn(`Skipping (no ID): ${filename}`); continue; }
    if (seenIds.has(id)) { console.warn(`Skipping duplicate ID "${id}": ${filename}`); continue; }
    seenIds.add(id);

    const year = yearFromFilename(filename);
    manifest.push({
      id,
      url: `https://${CF_DOMAIN}/${PREFIX}${encodeURIComponent(filename)}`,
      title: titleFromFilename(filename),
      ...(year ? { year } : {}),
    });
  }

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${PREFIX}manifest.json`,
      Body: `${JSON.stringify(manifest, null, 2)}\n`,
      ContentType: "application/json",
      CacheControl: "public, max-age=3600",
    }),
  );
  console.log(`Uploaded manifest.json with ${manifest.length} entries`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  rebuildManifest().catch((e) => { console.error(e.message || e); process.exit(1); });
}
