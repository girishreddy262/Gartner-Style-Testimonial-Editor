#!/usr/bin/env node
/**
 * Testimonial Video Renderer (Lambda SDK) v4 — chunk-and-stitch
 *
 * For videos longer than ~5 minutes, Remotion Lambda's built-in stitcher
 * abort errors out (downloads all chunks + ffmpeg concat in a single
 * Lambda — runs out of disk/memory/time). Instead, we:
 *
 *   1. Split the render into N chunks of <= 5 minutes (9000 frames) each
 *   2. Call renderMediaOnLambda() for each chunk in parallel, with frameRange
 *   3. Each chunk renders + stitches independently → part-N.mp4 in S3
 *   4. GitHub Action then runs ffmpeg locally to concat parts into final mp4
 *
 * Output written to out/render-result.json with:
 *   - For single-chunk: { mp4Url } points at the chunk output directly
 *   - For multi-chunk: { parts: [...], needsStitch: true } and the Action stitches.
 */
import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda/client';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REGION = process.env.REMOTION_REGION || 'ap-south-1';
const FUNCTION_NAME = process.env.REMOTION_FUNCTION_NAME || 'remotion-render-4-0-461-mem3008mb-disk5120mb-900sec';
const SERVE_URL = process.env.REMOTION_SERVE_URL || 'https://remotionlambda-apsouth1-9dlkcsayxl.s3.ap-south-1.amazonaws.com/sites/testimonial-editor/index.html';
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET || 'darwinbox-gartner-testimonial-editor';
const FPS = 30;
const FRAMES_PER_CHUNK = parseInt(process.env.FRAMES_PER_CHUNK || '9000', 10);

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

const inputProps = {
  intro: project.intro || {},
  namecard: project.namecard || {},
  global: project.global || {},
  callouts: Array.isArray(project.callouts) ? project.callouts : [],
  totalDuration: project.totalDuration || 240,
};

const projectId = project.projectId || project.jobId || 'unknown';
const jobId = project.jobId || projectId;
const totalFrames = Math.ceil(inputProps.totalDuration * FPS);
const numChunks = Math.ceil(totalFrames / FRAMES_PER_CHUNK);

function calculateFramesPerLambda(chunkFrames) {
  const target = 60;
  const computed = Math.ceil(chunkFrames / target);
  return Math.max(60, Math.min(600, computed));
}

console.log('Testimonial renderer (chunk-and-stitch)');
console.log(`  jobId:           ${jobId}`);
console.log(`  projectId:       ${projectId}`);
console.log(`  region:          ${REGION}`);
console.log(`  function:        ${FUNCTION_NAME}`);
console.log(`  totalDuration:   ${inputProps.totalDuration}s`);
console.log(`  totalFrames:     ${totalFrames}`);
console.log(`  framesPerChunk:  ${FRAMES_PER_CHUNK}`);
console.log(`  numChunks:       ${numChunks}`);
console.log(`  callouts:        ${inputProps.callouts.length}`);
console.log('');

const chunks = [];
for (let i = 0; i < numChunks; i++) {
  const startFrame = i * FRAMES_PER_CHUNK;
  const endFrame = Math.min(totalFrames - 1, (i + 1) * FRAMES_PER_CHUNK - 1);
  const partKey = numChunks === 1
    ? `testimonials/${projectId}/output.mp4`
    : `testimonials/${projectId}/parts/part-${String(i + 1).padStart(3, '0')}.mp4`;
  chunks.push({
    index: i + 1,
    frameRange: [startFrame, endFrame],
    outputKey: partKey,
    framesPerLambda: calculateFramesPerLambda(endFrame - startFrame + 1),
  });
}

console.log('Chunk plan:');
for (const c of chunks) {
  console.log(`  Part ${c.index}: frames ${c.frameRange[0]}-${c.frameRange[1]} (${c.frameRange[1] - c.frameRange[0] + 1} frames, fpL=${c.framesPerLambda}) -> ${c.outputKey}`);
}
console.log('');

console.log('Triggering all chunk renders in parallel...');
const startTime = Date.now();
const renderHandles = await Promise.all(chunks.map(async (chunk) => {
  console.log(`  -> triggering Part ${chunk.index}...`);
  const result = await renderMediaOnLambda({
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
    framesPerLambda: chunk.framesPerLambda,
    frameRange: chunk.frameRange,
    maxRetries: 3,
    concurrencyPerLambda: 1,
    outName: {
      bucketName: OUTPUT_BUCKET,
      key: chunk.outputKey,
      s3OutputProvider: undefined,
    },
  });
  console.log(`    Part ${chunk.index} renderId: ${result.renderId}`);
  return { chunk, renderId: result.renderId, bucketName: result.bucketName };
}));
console.log('');

async function pollChunk(handle) {
  const { chunk, renderId, bucketName } = handle;
  let lastPct = -1;
  const pollInterval = 4000;
  const maxWaitMs = 15 * 60 * 1000;
  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt > maxWaitMs) {
      throw new Error(`Part ${chunk.index} timed out after ${maxWaitMs / 1000}s`);
    }
    await new Promise((r) => setTimeout(r, pollInterval));
    const progress = await getRenderProgress({
      renderId, bucketName,
      functionName: FUNCTION_NAME,
      region: REGION,
    });
    const pct = Math.round((progress.overallProgress || 0) * 100);
    if (pct !== lastPct && pct > lastPct + 4) {
      console.log(`  Part ${chunk.index}: ${pct}%`);
      lastPct = pct;
    }
    if (progress.fatalErrorEncountered) {
      const errMsg = progress.errors?.[0]?.message || 'unknown error';
      throw new Error(`Part ${chunk.index} fatal: ${errMsg}`);
    }
    if (progress.done) {
      const url = progress.outputFile || `https://${OUTPUT_BUCKET}.s3.${REGION}.amazonaws.com/${chunk.outputKey}`;
      console.log(`  Part ${chunk.index}: DONE -> ${url}`);
      return { chunk, url, framesRendered: progress.framesRendered };
    }
  }
}

console.log('Polling all chunks (parallel)...');
const results = await Promise.all(renderHandles.map(pollChunk));

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('');
console.log(`All chunks rendered in ${elapsed}s.`);

mkdirSync('out', { recursive: true });

if (numChunks === 1) {
  const result = results[0];
  const finalUrl = `https://${OUTPUT_BUCKET}.s3.${REGION}.amazonaws.com/${result.chunk.outputKey}`;
  writeFileSync('out/render-result.json', JSON.stringify({
    jobId, projectId,
    mp4Url: finalUrl,
    outputKey: result.chunk.outputKey,
    outputBucket: OUTPUT_BUCKET,
    needsStitch: false,
    elapsedSec: parseFloat(elapsed),
  }, null, 2));
  console.log(`Output: ${finalUrl}`);
} else {
  const parts = results.map((r) => ({
    index: r.chunk.index,
    s3Key: r.chunk.outputKey,
    url: r.url,
  }));
  const finalKey = `testimonials/${projectId}/output.mp4`;
  const finalUrl = `https://${OUTPUT_BUCKET}.s3.${REGION}.amazonaws.com/${finalKey}`;
  writeFileSync('out/render-result.json', JSON.stringify({
    jobId, projectId,
    needsStitch: true,
    parts,
    outputBucket: OUTPUT_BUCKET,
    outputKey: finalKey,
    mp4Url: finalUrl,
    elapsedSec: parseFloat(elapsed),
  }, null, 2));
  console.log(`Wrote ${parts.length} parts. Stitch step will produce: ${finalUrl}`);
}

process.exit(0);
