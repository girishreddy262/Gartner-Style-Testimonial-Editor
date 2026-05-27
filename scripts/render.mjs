#!/usr/bin/env node
/**
 * Testimonial Video Renderer (Lambda) v3.0
 *
 * Usage:
 *   node render.mjs <payload-path>
 *
 * Reads a project state JSON, calls Remotion's renderMediaOnLambda() SDK
 * (which handles all default field plumbing the raw payload approach was
 * missing), polls progress, and writes the final URL to out/render-result.json.
 *
 * Environment variables (set in GitHub Actions):
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   REMOTION_REGION              (default: ap-south-1)
 *   REMOTION_FUNCTION_NAME       (Lambda function name)
 *   REMOTION_SERVE_URL           (S3 URL of the deployed Remotion bundle)
 *   OUTPUT_BUCKET                (S3 bucket for output mp4)
 */
import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda/client';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REGION = process.env.REMOTION_REGION || 'ap-south-1';
const FUNCTION_NAME = process.env.REMOTION_FUNCTION_NAME || 'remotion-render-4-0-461-mem3008mb-disk5120mb-600sec';
const SERVE_URL = process.env.REMOTION_SERVE_URL || 'https://remotionlambda-apsouth1-9dlkcsayxl.s3.ap-south-1.amazonaws.com/sites/testimonial-editor/index.html';
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET || 'darwinbox-gartner-testimonial-editor';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node render.mjs <payload.json>');
  process.exit(1);
}

const payloadPath = resolve(args[0]);
if (!existsSync(payloadPath)) {
  console.error(`Payload file not found: ${payloadPath}`);
  process.exit(1);
}

const project = JSON.parse(readFileSync(payloadPath, 'utf-8'));

// Build the inputProps the Remotion composition expects.
// Drop legacy fields (scenes, bulletTimings, frameSettings, etc.) that the new
// composition does not read.
const inputProps = {
  intro: project.intro || {},
  namecard: project.namecard || {},
  global: project.global || {},
  callouts: Array.isArray(project.callouts) ? project.callouts : [],
  totalDuration: project.totalDuration || 240,
};

const projectId = project.projectId || project.jobId || 'unknown';
const jobId = project.jobId || projectId;

console.log(`Testimonial renderer (Lambda SDK)`);
console.log(`  jobId:        ${jobId}`);
console.log(`  projectId:    ${projectId}`);
console.log(`  region:       ${REGION}`);
console.log(`  function:     ${FUNCTION_NAME}`);
console.log(`  serveUrl:     ${SERVE_URL}`);
console.log(`  bucket:       ${OUTPUT_BUCKET}`);
console.log(`  callouts:     ${inputProps.callouts.length}`);
console.log(`  totalDur:     ${inputProps.totalDuration}s`);
console.log(`  hasVideo:     ${!!inputProps.global.sourceVideoUrl}`);
console.log('');

const outputKey = `testimonials/${projectId}/output.mp4`;

// Calculate framesPerLambda dynamically. Goal: keep total Lambda function count
// under 200 (Remotion's hard limit). Each Lambda is fast (~5-15s for 30-60 frames)
// so chunking up is fine. Formula targets ~150 chunks for headroom.
// Examples:
//   240s video = 7200 frames → fpL = max(60, 7200/150) = 60 → 120 lambdas ✓
//   960s video = 28800 frames → fpL = max(60, 28800/150) = 192 → 150 lambdas ✓
//   1800s video = 54000 frames → fpL = max(60, 54000/150) = 360 → 150 lambdas ✓
function calculateFramesPerLambda(totalDurationSec, fps = 30) {
  const totalFrames = totalDurationSec * fps;
  const targetLambdas = 150;
  const computed = Math.ceil(totalFrames / targetLambdas);
  // Floor at 60 (so short videos aren't over-chunked) and cap at 600 (Lambda timeout safety)
  return Math.max(60, Math.min(600, computed));
}

const framesPerLambda = calculateFramesPerLambda(inputProps.totalDuration || 240);
console.log(`  framesPerLambda: ${framesPerLambda}  (targets ~150 Lambda invocations)`);
console.log('');

console.log('Triggering Lambda render via SDK...');
const startTime = Date.now();

const { renderId, bucketName } = await renderMediaOnLambda({
  region: REGION,
  functionName: FUNCTION_NAME,
  serveUrl: SERVE_URL,
  composition: 'TestimonialReel',
  inputProps,
  codec: 'h264',
  imageFormat: 'jpeg',
  crf: 22,
  pixelFormat: 'yuv420p',
  privacy: 'public',
  framesPerLambda,
  maxRetries: 3,
  concurrencyPerLambda: 1,
  outName: {
    bucketName: OUTPUT_BUCKET,
    key: outputKey,
    s3OutputProvider: undefined,
  },
});

console.log(`  renderId:  ${renderId}`);
console.log(`  bucket:    ${bucketName}`);
console.log('');

// Poll progress
let lastPct = -1;
const pollInterval = 4000;
const maxWaitMs = 12 * 60 * 1000;
const startedAt = Date.now();

while (true) {
  if (Date.now() - startedAt > maxWaitMs) {
    console.error('Timed out waiting for render');
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, pollInterval));

  const progress = await getRenderProgress({
    renderId,
    bucketName,
    functionName: FUNCTION_NAME,
    region: REGION,
  });

  const pct = Math.round((progress.overallProgress || 0) * 100);
  if (pct !== lastPct) {
    console.log(`  progress: ${pct}%  framesRendered=${progress.framesRendered || 0}/${progress.renderMetadata?.frameRange?.[1] + 1 || '?'}`);
    lastPct = pct;
  }

  if (progress.fatalErrorEncountered) {
    console.error('FATAL ERROR:');
    console.error(JSON.stringify(progress.errors, null, 2));
    process.exit(1);
  }

  if (progress.done) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const outputUrl = progress.outputFile || `https://${OUTPUT_BUCKET}.s3.${REGION}.amazonaws.com/${outputKey}`;
    console.log('');
    console.log(`Render complete in ${elapsed}s`);
    console.log(`  output: ${outputUrl}`);

    mkdirSync('out', { recursive: true });
    writeFileSync('out/render-result.json', JSON.stringify({
      jobId,
      projectId,
      renderId,
      mp4Url: outputUrl,
      outputKey,
      outputBucket: OUTPUT_BUCKET,
      elapsedSec: parseFloat(elapsed),
      framesRendered: progress.framesRendered,
    }, null, 2));
    process.exit(0);
  }
}
