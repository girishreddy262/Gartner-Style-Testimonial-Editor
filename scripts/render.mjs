#!/usr/bin/env node
/**
 * Testimonial render script (Lambda) — mirrors the working product-showcase render.ts
 *
 * Key learnings from product-showcase that we apply here:
 *   - SIMPLE Lambda call — only essential options, let Remotion defaults handle the rest
 *   - DYNAMIC framesPerLambda — scales with video length so we stay under 200 Lambda cap
 *   - outName as plain STRING — Remotion uploads to its default bucket
 *     (remotionlambda-apsouth1-9dlkcsayxl/renders/{renderId}/{outName})
 *   - NO timeoutInMilliseconds, NO concurrencyPerLambda, NO audioCodec/muted/cache overrides
 */
import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda/client';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REGION = process.env.REMOTION_REGION || 'ap-south-1';
const FUNCTION_NAME = process.env.REMOTION_FUNCTION_NAME || 'remotion-render-4-0-461-mem3008mb-disk5120mb-900sec';
const SERVE_URL = process.env.REMOTION_SERVE_URL || 'https://remotionlambda-apsouth1-9dlkcsayxl.s3.ap-south-1.amazonaws.com/sites/testimonial-editor/index.html';

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
const totalDuration = inputProps.totalDuration;
const fps = 30;
const frames = Math.ceil(totalDuration * fps);

// Dynamic chunk sizing (copied from product-showcase render.ts).
// Short videos (~12,000 frames) → 60 frames/lambda for max parallelism + failure isolation.
// Long videos auto-scale chunk size so we never exceed 200 Lambda concurrent invocations.
// 10% safety margin keeps us off the 200 ceiling.
const MAX_LAMBDAS = 200;
const MIN_FRAMES_PER_LAMBDA = 60;
const minRequired = Math.ceil(frames / MAX_LAMBDAS);
const framesPerLambda = Math.max(MIN_FRAMES_PER_LAMBDA, Math.ceil(minRequired * 1.1));
const expectedChunks = Math.ceil(frames / framesPerLambda);

console.log('🎬 Testimonial Renderer (Lambda) — mirrors product-showcase config');
console.log(`   jobId:           ${jobId}`);
console.log(`   projectId:       ${projectId}`);
console.log(`   totalDuration:   ${totalDuration}s`);
console.log(`   frames:          ${frames} @ ${fps}fps`);
console.log(`   framesPerLambda: ${framesPerLambda} (expected ${expectedChunks} chunks, max ${MAX_LAMBDAS})`);
console.log(`   callouts:        ${inputProps.callouts.length}`);
console.log(`   hasVideo:        ${!!inputProps.global.sourceVideoUrl}`);
console.log(`   region:          ${REGION}`);
console.log(`   function:        ${FUNCTION_NAME}`);
console.log(`   serveUrl:        ${SERVE_URL}`);

console.log(`\n▶ Triggering Lambda render...`);
const startTime = Date.now();

try {
  const result = await renderMediaOnLambda({
    region: REGION,
    functionName: FUNCTION_NAME,
    serveUrl: SERVE_URL,
    composition: 'TestimonialReel',
    codec: 'h264',
    crf: 18,
    jpegQuality: 95,
    pixelFormat: 'yuv420p',
    inputProps,
    framesPerLambda,
    maxRetries: 3,
    privacy: 'public',
    outName: `testimonial-${jobId}.mp4`,
  });

  console.log(`   Render ID: ${result.renderId}`);
  console.log(`   Bucket: ${result.bucketName}`);
  console.log(`\n▶ Waiting for render to complete...`);

  let done = false;
  let outputUrl = '';
  let outputSize = 0;
  let lastPct = -1;

  while (!done) {
    await new Promise(r => setTimeout(r, 2000));
    const progress = await getRenderProgress({
      renderId: result.renderId,
      bucketName: result.bucketName,
      functionName: FUNCTION_NAME,
      region: REGION,
    });

    if (progress.done) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      outputUrl = `https://${result.bucketName}.s3.${REGION}.amazonaws.com/${progress.outKey}`;
      outputSize = progress.outputSizeInBytes || 0;
      console.log(`\n✅ Render complete in ${elapsed}s`);
      console.log(`   Output: ${outputUrl}`);
      console.log(`   Size: ${(outputSize / 1024 / 1024).toFixed(1)} MB`);
      console.log(`   Cost: ${progress.costs?.displayCost || '$0'}`);
      done = true;
    } else if (progress.fatalErrorEncountered) {
      console.error(`\n❌ Render failed`);
      const errs = progress.errors || [];
      errs.forEach((err, i) => {
        console.error(`\n   Error ${i + 1}/${errs.length}:`);
        console.error(`     Name: ${err.name || 'unknown'}`);
        console.error(`     Type: ${err.type || 'unknown'}`);
        console.error(`     Chunk: ${err.chunk ?? 'n/a'}`);
        console.error(`     Frame: ${err.frame ?? 'n/a'}`);
        console.error(`     Attempt: ${err.attempt}/${err.totalAttempts}`);
        console.error(`     Message: ${err.message || ''}`);
        if (err.explanation) console.error(`     Hint: ${err.explanation}`);
      });
      process.exit(1);
    } else {
      const pct = Math.round((progress.overallProgress || 0) * 100);
      const rendered = progress.framesRendered || 0;
      if (pct !== lastPct && pct - lastPct >= 5) {
        console.log(`   Progress: ${pct}% (${rendered}/${frames} frames)`);
        lastPct = pct;
      }
    }
  }

  // Write result for GitHub Actions to consume
  mkdirSync(resolve('out'), { recursive: true });
  writeFileSync(resolve('out/render-result.json'), JSON.stringify({
    status: 'success',
    mp4Url: outputUrl,
    outputSize,
    renderId: result.renderId,
    bucketName: result.bucketName,
    jobId,
    projectId,
    elapsedMs: Date.now() - startTime,
  }, null, 2));
  console.log(`   Result written to: out/render-result.json`);
} catch (e) {
  console.error(`\n❌ Lambda render error: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
}
