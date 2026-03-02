#!/usr/bin/env node
// Usage: node scripts/fix-cors.js [--dry-run]
// Configures S3 CORS and CloudFront response headers for cross-origin HLS playback.

import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import {
  CloudFrontClient,
  CreateResponseHeadersPolicyCommand,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  CreateInvalidationCommand,
  ListResponseHeadersPoliciesCommand,
} from "@aws-sdk/client-cloudfront";

const BUCKET = "seethroughlab-media";
const REGION = "us-east-1";
const DISTRIBUTION_ID = "E3HHODJ5DZ82EV";
const POLICY_NAME = "seethroughlab-cors";

// AWS managed CORS-S3Origin origin request policy
const CORS_S3_ORIGIN_REQUEST_POLICY_ID = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf";

const ALLOWED_ORIGINS = [
  "https://seethroughlab.github.io",
  "https://seethroughlab.com",
];

const DEV_ORIGINS = ["http://localhost:4321", "http://localhost:3000"];

const dryRun = process.argv.includes("--dry-run");

const s3 = new S3Client({ region: REGION });
const cf = new CloudFrontClient({ region: REGION });

// ── A. S3 Bucket CORS ──────────────────────────────────────────────────────

async function setS3Cors() {
  const corsConfig = {
    CORSRules: [
      {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET", "HEAD"],
        AllowedOrigins: [...ALLOWED_ORIGINS, "http://localhost:*"],
        ExposeHeaders: ["Content-Length", "Content-Type"],
        MaxAgeSeconds: 86400,
      },
    ],
  };

  console.log("\n── S3 Bucket CORS ──");
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Allowed origins: ${corsConfig.CORSRules[0].AllowedOrigins.join(", ")}`);
  console.log(`Allowed methods: ${corsConfig.CORSRules[0].AllowedMethods.join(", ")}`);

  if (dryRun) {
    console.log("[dry-run] Would set S3 CORS policy");
    return;
  }

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: corsConfig,
    })
  );
  console.log("✓ S3 CORS policy applied");
}

// ── B. CloudFront Response Headers Policy ───────────────────────────────────

async function findExistingPolicy() {
  const res = await cf.send(
    new ListResponseHeadersPoliciesCommand({ Type: "custom" })
  );
  const items = res.ResponseHeadersPolicyList?.Items || [];
  return items.find(
    (p) => p.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name === POLICY_NAME
  );
}

async function createOrGetResponseHeadersPolicy() {
  console.log("\n── CloudFront Response Headers Policy ──");

  const existing = await findExistingPolicy();
  if (existing) {
    const id = existing.ResponseHeadersPolicy.Id;
    console.log(`Policy "${POLICY_NAME}" already exists (${id})`);
    return id;
  }

  const policyConfig = {
    Name: POLICY_NAME,
    Comment: "CORS headers for HLS video playback on seethroughlab.com",
    CorsConfig: {
      AccessControlAllowOrigins: {
        Quantity: ALLOWED_ORIGINS.length,
        Items: ALLOWED_ORIGINS,
      },
      AccessControlAllowHeaders: {
        Quantity: 3,
        Items: ["Origin", "Range", "Accept"],
      },
      AccessControlAllowMethods: {
        Quantity: 2,
        Items: ["GET", "HEAD"],
      },
      AccessControlAllowCredentials: false,
      AccessControlMaxAgeSec: 86400,
      OriginOverride: false,
    },
  };

  console.log(`Policy name: ${POLICY_NAME}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);

  if (dryRun) {
    console.log("[dry-run] Would create response headers policy");
    return null;
  }

  const res = await cf.send(
    new CreateResponseHeadersPolicyCommand({
      ResponseHeadersPolicyConfig: policyConfig,
    })
  );
  const id = res.ResponseHeadersPolicy.Id;
  console.log(`✓ Created response headers policy: ${id}`);
  return id;
}

// ── C. Update CloudFront Distribution ───────────────────────────────────────

async function updateDistribution(responseHeadersPolicyId) {
  console.log("\n── CloudFront Distribution ──");
  console.log(`Distribution: ${DISTRIBUTION_ID}`);

  const { DistributionConfig, ETag } = await cf.send(
    new GetDistributionConfigCommand({ Id: DISTRIBUTION_ID })
  );

  const defaultBehavior = DistributionConfig.DefaultCacheBehavior;

  const currentRHP = defaultBehavior.ResponseHeadersPolicyId || "(none)";
  const currentORP = defaultBehavior.OriginRequestPolicyId || "(none)";

  console.log(`Current response headers policy: ${currentRHP}`);
  console.log(`Current origin request policy: ${currentORP}`);

  const needsRHP = responseHeadersPolicyId && currentRHP !== responseHeadersPolicyId;
  const needsORP = currentORP !== CORS_S3_ORIGIN_REQUEST_POLICY_ID;

  if (!needsRHP && !needsORP) {
    console.log("✓ Distribution already configured correctly");
    return;
  }

  if (needsRHP) {
    console.log(`→ Setting response headers policy to: ${responseHeadersPolicyId}`);
    defaultBehavior.ResponseHeadersPolicyId = responseHeadersPolicyId;
  }
  if (needsORP) {
    console.log(`→ Setting origin request policy to: ${CORS_S3_ORIGIN_REQUEST_POLICY_ID} (CORS-S3Origin)`);
    defaultBehavior.OriginRequestPolicyId = CORS_S3_ORIGIN_REQUEST_POLICY_ID;
  }

  if (dryRun) {
    console.log("[dry-run] Would update distribution");
    return;
  }

  await cf.send(
    new UpdateDistributionCommand({
      Id: DISTRIBUTION_ID,
      DistributionConfig,
      IfMatch: ETag,
    })
  );
  console.log("✓ Distribution updated");
}

// ── D. Invalidate Cache ─────────────────────────────────────────────────────

async function invalidateCache() {
  console.log("\n── Cache Invalidation ──");
  console.log(`Distribution: ${DISTRIBUTION_ID}`);
  console.log("Path: /videos/*");

  if (dryRun) {
    console.log("[dry-run] Would create invalidation for /videos/*");
    return;
  }

  const res = await cf.send(
    new CreateInvalidationCommand({
      DistributionId: DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `fix-cors-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ["/videos/*"],
        },
      },
    })
  );
  console.log(`✓ Invalidation created: ${res.Invalidation.Id}`);
  console.log("  (takes ~2 minutes to complete)");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fix CORS for CloudFront Video Delivery");
  if (dryRun) console.log("(DRY RUN — no changes will be made)\n");

  await setS3Cors();
  const policyId = await createOrGetResponseHeadersPolicy();
  await updateDistribution(policyId);
  await invalidateCache();

  console.log("\n── Done ──");
  if (dryRun) {
    console.log("Re-run without --dry-run to apply changes.");
  } else {
    console.log("CORS configuration complete.");
    console.log("\nVerify with:");
    console.log(
      '  curl -I -H "Origin: https://seethroughlab.github.io" https://d13tobysqmg65w.cloudfront.net/videos/cosmic-crisis/index.m3u8'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
