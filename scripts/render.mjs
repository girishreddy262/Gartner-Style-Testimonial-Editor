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
const MAX_CHUNK_RETRIES = 2;

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

console.log('Triggering all chunk renders in parallel (with retry-on-failure)...');
const startTime = Date.now();

// Render + poll a single chunk. Retries up to MAX_CHUNK_RETRIES on transient
// stitcher failures (AbortError etc).
async function renderChunkWithRetry(chunk) {
  let attempt = 0;
  let lastErr = null;
  while (attempt <= MAX_CHUNK_RETRIES) {
    attempt++;
    const label = attempt === 1 ? `Part ${chunk.index}` : `Part ${chunk.index} (retry ${attempt - 1})`;
    try {
      console.log(`  -> triggering ${label}: frames ${chunk.frameRange[0]}-${chunk.frameRange[1]}`);
      const triggerResult = await renderMediaOnLambda({
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
        // The launch Lambda waits for chunks via this timeout. Set generous —
        // Lambda's hard timeout is 15min, our function has 900s (15min) configured.
        // Default of 30000ms causes 'stitcher' AbortError when render takes >30s.
        timeoutInMilliseconds: 840000, // 14 minutes
        audioCodec: 'aac',
        muted: true,
        offthreadVideoCacheSizeInBytes: 524288000,
        outName: {
          bucketName: OUTPUT_BUCKET,
          key: chunk.outputKey,
          s3OutputProvider: undefined,
        },
      });
      console.log(`     ${label} renderId: ${triggerResult.renderId}`);

      const pollResult = await pollChunk({
        chunk,
        renderId: triggerResult.renderId,
        bucketName: triggerResult.bucketName,
      });
      console.log(`     ${label}: SUCCESS`);
      return pollResult;
    } catch (e) {
      lastErr = e;
      console.error(`     ${label}: FAILED — ${e.message}`);
      if (attempt > MAX_CHUNK_RETRIES) break;
      // Brief backoff before retrying
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw new Error(`Part ${chunk.index}: all ${MAX_CHUNK_RETRIES + 1} attempts failed. Last: ${lastErr?.message}`);
}

async function pollChunk({ chunk, renderId, bucketName }) {
  let lastPct = -1;
  const pollInterval = 4000;
  const maxWaitMs = 15 * 60 * 1000;
  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt > maxWaitMs) {
      throw new Error(`Part ${chunk.index} polling timed out`);
    }
    await new Promise((r) => setTimeout(r, pollInterval));
    const progress = await getRenderProgress({
      renderId, bucketName,
      functionName: FUNCTION_NAME,
      region: REGION,
    });
    const pct = Math.round((progress.overallProgress || 0) * 100);
    if (pct !== lastPct && pct > lastPct + 4) {
      console.log(`     Part ${chunk.index}: ${pct}%`);
      lastPct = pct;
    }
    if (progress.fatalErrorEncountered) {
      const errMsg = progress.errors?.[0]?.message || 'unknown error';
      throw new Error(errMsg);
    }
    if (progress.done) {
      const url = progress.outputFile || `https://${OUTPUT_BUCKET}.s3.${REGION}.amazonaws.com/${chunk.outputKey}`;
      return { chunk, url, framesRendered: progress.framesRendered };
    }
  }
}

// Render chunks SEQUENTIALLY with a 30-second pause between them.
// The pause lets HTTP connections/streams from the previous render drain before
// the next one starts — AbortError stacks frequently happen when S3 read/write
// streams from a finished render get aborted by AWS SDK because the next render
// is competing for the connection pool.
const results = [];
for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i];
  if (i > 0) {
    console.log('\n  Pausing 30s before next chunk (let connections drain)...');
    await new Promise((r) => setTimeout(r, 30000));
  }
  console.log(`\n=== Rendering Part ${chunk.index}/${chunks.length} ===`);
  const result = await renderChunkWithRetry(chunk);
  results.push(result);
}

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
