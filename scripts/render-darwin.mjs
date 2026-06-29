#!/usr/bin/env node
/**
 * Darwin Reel render script (Lambda): parallels scripts/render.mjs.
 * Renders the DarwinReel composition (1080x1920 vertical).
 *
 * Payload (from worker, already parsed): {
 *   jobId, projectId,
 *   darwinUrl, stockUrls[], musicUrl, musicVolume,
 *   segments[], captions[], totalDuration, captionStyle?
 * }
 */
import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda/client';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REGION = process.env.REMOTION_REGION || 'ap-south-1';
const FUNCTION_NAME = process.env.REMOTION_FUNCTION_NAME || 'remotion-render-4-0-461-mem3008mb-disk5120mb-900sec';
const SERVE_URL = process.env.REMOTION_SERVE_URL || 'https://remotionlambda-apsouth1-9dlkcsayxl.s3.ap-south-1.amazonaws.com/sites/testimonial-editor/index.html';

const args = process.argv.slice(2);
if (args.length < 1) { console.error('Usage: node render-darwin.mjs <payload.json>'); process.exit(1); }
const payloadPath = resolve(args[0]);
if (!existsSync(payloadPath)) { console.error(`Payload not found: ${payloadPath}`); process.exit(1); }

const project = JSON.parse(readFileSync(payloadPath, 'utf-8'));

const totalDuration = project.totalDuration || 30;
const fps = 30;
const frames = Math.ceil(totalDuration * fps);

// inputProps for the DarwinReel composition. __darwin flag tells Root which one.
const inputProps = {
  __darwin: true,
  darwinUrl: project.darwinUrl || null,
  stockUrls: Array.isArray(project.stockUrls) ? project.stockUrls : [],
  musicUrl: project.musicUrl || null,
  musicVolume: typeof project.musicVolume === 'number' ? project.musicVolume : 0.15,
  segments: Array.isArray(project.segments) ? project.segments : [],
  captions: Array.isArray(project.captions) ? project.captions : [],
  darwinClips: Array.isArray(project.darwinClips) ? project.darwinClips : [],
  totalDuration,
  captionStyle: project.captionStyle || {},
};

const projectId = project.projectId || project.jobId || 'unknown';
const jobId = project.jobId || projectId;

const MAX_LAMBDAS = 200, MIN_FRAMES_PER_LAMBDA = 60;
const minRequired = Math.ceil(frames / MAX_LAMBDAS);
const framesPerLambda = Math.max(MIN_FRAMES_PER_LAMBDA, Math.ceil(minRequired * 1.1));

console.log('🎬 Darwin Reel Renderer (Lambda)');
console.log(`   jobId: ${jobId}  projectId: ${projectId}`);
console.log(`   totalDuration: ${totalDuration}s  frames: ${frames}@${fps}`);
console.log(`   segments: ${inputProps.segments.length}  captions: ${inputProps.captions.length}`);
console.log(`   darwin: ${!!inputProps.darwinUrl}  stock: ${inputProps.stockUrls.length}  music: ${!!inputProps.musicUrl}`);

const startTime = Date.now();
try {
  const result = await renderMediaOnLambda({
    region: REGION, functionName: FUNCTION_NAME, serveUrl: SERVE_URL,
    composition: 'DarwinReel',
    codec: 'h264', crf: 18, jpegQuality: 95, pixelFormat: 'yuv420p',
    inputProps, framesPerLambda, maxRetries: 3, privacy: 'public',
    outName: `darwin-${jobId}.mp4`,
  });
  console.log(`   Render ID: ${result.renderId}`);

  let done = false, outputUrl = '', outputSize = 0, lastPct = -1;
  while (!done) {
    await new Promise(r => setTimeout(r, 2000));
    const progress = await getRenderProgress({
      renderId: result.renderId, bucketName: result.bucketName,
      functionName: FUNCTION_NAME, region: REGION,
    });
    if (progress.done) {
      outputUrl = `https://${result.bucketName}.s3.${REGION}.amazonaws.com/${progress.outKey}`;
      outputSize = progress.outputSizeInBytes || 0;
      console.log(`✅ Done in ${((Date.now()-startTime)/1000).toFixed(1)}s → ${outputUrl}`);
      console.log(`   Cost: ${progress.costs?.displayCost || '$0'}`);
      done = true;
    } else if (progress.fatalErrorEncountered) {
      console.error('❌ Render failed');
      (progress.errors || []).forEach((err, i) => console.error(`  Error ${i+1}: ${err.message || ''} ${err.explanation||''}`));
      process.exit(1);
    } else {
      const pct = Math.round((progress.overallProgress || 0) * 100);
      if (pct - lastPct >= 5) { console.log(`   ${pct}% (${progress.framesRendered||0}/${frames})`); lastPct = pct; }
    }
  }

  mkdirSync(resolve('out'), { recursive: true });
  writeFileSync(resolve('out/render-result.json'), JSON.stringify({
    status: 'success', mp4Url: outputUrl, outputSize,
    renderId: result.renderId, bucketName: result.bucketName, jobId, projectId,
    elapsedMs: Date.now() - startTime,
  }, null, 2));
} catch (e) {
  console.error(`❌ Lambda render error: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
}
