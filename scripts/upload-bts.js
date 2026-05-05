#!/usr/bin/env node

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { execFileSync, spawn } from "child_process";
import { createReadStream, mkdirSync, readdirSync, statSync as fsStatSync, writeFileSync } from "fs";
import { basename, extname, join, resolve } from "path";
import slugify from "slugify";

const BUCKET = "seethroughlab-media";
const REGION = "us-east-1";
const CF_DOMAIN = process.env.CF_DOMAIN || "d13tobysqmg65w.cloudfront.net";
const DEFAULT_SOURCE =
  process.env.BTS_SOURCE || "root@openmediavault:/srv/dev-disk-by-uuid-8dfd5250-f9f8-470e-b821-820ea31be6e6/Vimeo";
const MANIFEST_PATH = resolve("public/bts/manifest.json");
const DEFAULT_MATCHER = "(^|[\\/_\\-\\s])bts([\\/_\\-\\s]|$)|behind[\\s_-]*the[\\s_-]*scenes";

// --- arg parsing ---

function parseArgs(argv) {
  const options = {
    dryRun: false,
    jsonTags: undefined,
    limit: undefined,
    match: process.env.BTS_MATCH || DEFAULT_MATCHER,
    source: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--dry-run") { options.dryRun = true; continue; }
    if (arg === "--all-mp4s") { options.match = ""; continue; }

    if (arg === "--match") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --match");
      options.match = value;
      i += 1;
      continue;
    }

    if (arg === "--json-tags") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --json-tags");
      options.jsonTags = value;
      i += 1;
      continue;
    }

    if (arg === "--limit") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--limit must be a positive integer");
      options.limit = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    if (!options.source) { options.source = arg; continue; }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  options.source ||= DEFAULT_SOURCE;
  return options;
}

function printUsage() {
  console.error("Usage: node scripts/upload-bts.js [source] [--dry-run] [--match <regex>] [--all-mp4s] [--json-tags <tag>] [--limit <n>]");
  console.error(`Default source: ${DEFAULT_SOURCE}`);
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message || error);
  printUsage();
  process.exit(1);
}

const matcher = options.match ? new RegExp(options.match, "i") : null;

// --- helpers ---

function isRemoteSource(source) {
  return /^[^/][^:]*:.+/.test(source);
}

function parseRemoteSource(source) {
  const splitIndex = source.indexOf(":");
  if (splitIndex <= 0) throw new Error(`Invalid remote source: ${source}`);
  return { remote: source.slice(0, splitIndex), remotePath: source.slice(splitIndex + 1) };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function filterPaths(paths) {
  return matcher ? paths.filter((p) => matcher.test(p)) : paths;
}

// --- local file utilities ---

function walkMp4Files(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) { entries.push(...walkMp4Files(fullPath)); continue; }
    if (stats.isFile() && extname(name).toLowerCase() === ".mp4") entries.push(fullPath);
  }
  return entries.sort((a, b) => a.localeCompare(b));
}

function getDurationAndSize(filePath) {
  const output = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
    { encoding: "utf8" },
  ).trim();
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid duration for ${filePath}`);
  return { duration: Number(duration.toFixed(2)), size: fsStatSync(filePath).size };
}

// --- remote file utilities ---

function relativeRemotePath(remotePath, basePath) {
  const normalizedBase = basePath.replace(/\/+$/, "");
  if (remotePath === normalizedBase) return basename(remotePath);
  if (remotePath.startsWith(`${normalizedBase}/`)) return remotePath.slice(normalizedBase.length + 1);
  throw new Error(`Remote path ${remotePath} is outside base path ${basePath}`);
}

function listRemoteMp4Files(source) {
  const { remote, remotePath } = parseRemoteSource(source);
  const command = `find ${shellQuote(remotePath)} -type f \\( -iname '*.mp4' \\) -print`;
  const output = execFileSync("ssh", [remote, command], { encoding: "utf8" });
  const files = output.split("\n").map((l) => l.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const filtered = filterPaths(files.map((f) => relativeRemotePath(f, remotePath)));
  return { remote, remotePath, files: filtered };
}

function listRemoteTaggedMp4Files(source, tag) {
  const { remote, remotePath } = parseRemoteSource(source);
  const script = [
    "import json, sys",
    "from pathlib import Path",
    "root, tag = sys.argv[1], sys.argv[2].lower()",
    "for p in sorted(Path(root).rglob('*.json')):",
    "    try:",
    "        d = json.loads(p.read_text())",
    "        tags = [t.get('tag', '').lower() if isinstance(t, dict) else str(t).lower() for t in (d.get('tags') or [])]",
    "        if tag in tags:",
    "            mp4 = p.with_suffix('.mp4')",
    "            if mp4.exists(): print(str(mp4))",
    "    except Exception: pass",
  ].join("\n");
  const command = `python3 -c ${shellQuote(script)} ${shellQuote(remotePath)} ${shellQuote(tag)}`;
  const output = execFileSync("ssh", [remote, command], { encoding: "utf8" });
  const files = output.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((f) => relativeRemotePath(f, remotePath))
    .sort((a, b) => a.localeCompare(b));
  return { remote, remotePath, files };
}

function getDurationAndSizeRemote(remote, absolutePath) {
  const command = `ffprobe -v error -show_entries format=duration -of csv=p=0 ${shellQuote(absolutePath)} && stat -c %s ${shellQuote(absolutePath)}`;
  const lines = execFileSync("ssh", [remote, command], { encoding: "utf8" }).trim().split("\n");
  const duration = Number(lines[0]);
  const size = Number(lines[1]);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid duration for ${absolutePath}`);
  if (!Number.isInteger(size) || size <= 0) throw new Error(`Invalid size for ${absolutePath}`);
  return { duration: Number(duration.toFixed(2)), size };
}

function createRemoteReadStream(remote, absolutePath) {
  const proc = spawn(
    "ssh",
    ["-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=8", remote, `cat ${shellQuote(absolutePath)}`],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  return proc.stdout;
}

// --- entry building ---

function titleFromFilename(filename) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function yearFromFilename(filename) {
  const match = filename.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function buildEntries(files, remote, remotePath) {
  const seenKeys = new Set();
  const seenIds = new Set();

  return files.map((filePath) => {
    const filename = basename(filePath);
    const filenameKey = filename.toLowerCase();
    if (seenKeys.has(filenameKey)) throw new Error(`Duplicate output filename detected: ${filename}`);
    seenKeys.add(filenameKey);

    const id = slugify(filename.replace(/\.[^.]+$/, ""), { lower: true, strict: true });
    if (!id) throw new Error(`Unable to derive ID from filename: ${filename}`);
    if (seenIds.has(id)) throw new Error(`Duplicate manifest ID detected: ${id}`);
    seenIds.add(id);

    const absolutePath = remote
      ? `${remotePath.replace(/\/+$/, "")}/${filePath}`
      : filePath;

    const { duration, size } = remote
      ? getDurationAndSizeRemote(remote, absolutePath)
      : getDurationAndSize(filePath);

    const title = titleFromFilename(filename);
    const year = yearFromFilename(filename);

    return {
      id,
      filename,
      ...(remote ? { remote, absolutePath } : { filePath }),
      url: `https://${CF_DOMAIN}/bts/${encodeURIComponent(filename)}`,
      duration,
      size,
      title,
      ...(year ? { year } : {}),
    };
  });
}

// --- manifest / upload ---

function writeManifest(entries) {
  mkdirSync(resolve("public/bts"), { recursive: true });
  const manifest = entries.map(({ id, url, duration, title, year }) => ({
    id,
    url,
    duration,
    title,
    ...(year ? { year } : {}),
  }));
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function uploadEntries(entries, manifest) {
  const client = new S3Client({ region: REGION });

  for (const entry of entries) {
    const body = entry.remote
      ? createRemoteReadStream(entry.remote, entry.absolutePath)
      : createReadStream(entry.filePath);

    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `bts/${entry.filename}`,
        Body: body,
        ContentLength: entry.size,
        ContentType: "video/mp4",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    console.log(`Uploaded bts/${entry.filename}`);
  }

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: "bts/manifest.json",
      Body: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      ContentType: "application/json",
      CacheControl: "public, max-age=3600",
    }),
  );
  console.log("Uploaded bts/manifest.json");
}

// --- main ---

async function main() {
  const source = options.source;

  let allFiles, remote, remotePath;

  if (isRemoteSource(source)) {
    ({ remote, remotePath, files: allFiles } = options.jsonTags
      ? listRemoteTaggedMp4Files(source, options.jsonTags)
      : listRemoteMp4Files(source));
  } else {
    const sourceDir = resolve(source);
    allFiles = filterPaths(walkMp4Files(sourceDir));
    remote = null;
    remotePath = null;
  }

  const files = options.limit ? allFiles.slice(0, options.limit) : allFiles;

  if (files.length === 0) {
    const label = matcher ? "matching MP4 files" : "MP4 files";
    throw new Error(`No ${label} found in ${source}`);
  }

  console.log(
    `Found ${allFiles.length} ${matcher ? "matching " : ""}MP4 files in ${source}` +
    (options.limit ? ` (uploading first ${files.length})` : ""),
  );

  if (remote) {
    console.log("Reading durations from NAS via ffprobe...");
  }

  const entries = buildEntries(files, remote, remotePath);
  const manifest = writeManifest(entries);
  console.log(`Wrote ${MANIFEST_PATH}`);

  if (options.dryRun) {
    console.log("Dry run enabled; skipped S3 upload.");
    return;
  }

  await uploadEntries(entries, manifest);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
