// Render worker - runs in GitHub Action.
// Finds jobs with status=pending_render, renders them with Remotion, uploads MP4 to GH Release.

import { Octokit } from '@octokit/rest';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import fs from 'fs';
import path from 'path';
import https from 'https';

const GH_TOKEN = process.env.GH_TOKEN;
const DBX_TOKEN = process.env.DROPBOX_TOKEN;
const REPO = process.env.REPO;
const [owner, repo] = REPO.split('/');

if (!GH_TOKEN || !DBX_TOKEN || !REPO) {
  console.error('Missing required env: GH_TOKEN, DROPBOX_TOKEN, REPO');
  process.exit(1);
}

const octokit = new Octokit({ auth: GH_TOKEN });

async function main() {
  const jobs = await listPendingJobs();
  if (jobs.length === 0) {
    console.log('No jobs pending render.');
    return;
  }
  console.log(`Found ${jobs.length} job(s) pending render: ${jobs.map(j => j.jobId).join(', ')}`);

  // Bundle Remotion once for all jobs in this run
  console.log('Bundling Remotion composition...');
  const bundleLocation = await bundle({
    entryPoint: path.resolve('remotion/src/index.ts'),
    onProgress: (p) => process.stdout.write(`  bundle: ${Math.round(p)}%\r`)
  });
  console.log('\nBundle ready at', bundleLocation);

  for (const job of jobs) {
    try {
      await renderJob(job, bundleLocation);
    } catch (e) {
      console.error(`Render failed for ${job.jobId}:`, e);
      await updateJob(job.jobId, {
        status: 'failed',
        render: { mp4Url: null, completedAt: new Date().toISOString(), error: String(e.message || e) }
      });
    }
  }
}

async function listPendingJobs() {
  const r = await octokit.repos.getContent({ owner, repo, path: 'jobs' }).catch(() => null);
  if (!r || !Array.isArray(r.data)) return [];
  const jobs = [];
  for (const item of r.data) {
    if (!item.name.endsWith('.json')) continue;
    const file = await octokit.repos.getContent({ owner, repo, path: item.path });
    const content = Buffer.from(file.data.content, 'base64').toString('utf8');
    const job = JSON.parse(content);
    if (job.status === 'pending_render') {
      job._sha = file.data.sha;
      jobs.push(job);
    }
  }
  return jobs;
}

async function updateJob(jobId, patch) {
  const file = await octokit.repos.getContent({ owner, repo, path: `jobs/${jobId}.json` });
  const current = JSON.parse(Buffer.from(file.data.content, 'base64').toString('utf8'));
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await octokit.repos.createOrUpdateFileContents({
    owner, repo, path: `jobs/${jobId}.json`,
    message: `Update job ${jobId} from renderer`,
    content: Buffer.from(JSON.stringify(updated, null, 2)).toString('base64'),
    sha: file.data.sha
  });
}

async function getDropboxTempLink(dropboxPath) {
  const r = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + DBX_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dropboxPath })
  });
  if (!r.ok) throw new Error('Dropbox temp link failed: ' + r.status + ' ' + await r.text());
  const data = await r.json();
  return data.link;
}

function downloadTo(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        return downloadTo(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) { reject(new Error('Download failed: ' + res.statusCode)); return; }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function renderJob(job, bundleLocation) {
  console.log(`\n=== Rendering job: ${job.jobId} ===`);
  await updateJob(job.jobId, { status: 'rendering' });

  // 1. Download video from Dropbox
  const tmpDir = path.join('/tmp', job.jobId);
  fs.mkdirSync(tmpDir, { recursive: true });
  const videoLocalPath = path.join(tmpDir, 'video.mp4');
  console.log('Fetching video from Dropbox...');
  const tempLink = await getDropboxTempLink(job.dropboxVideoPath);
  await downloadTo(tempLink, videoLocalPath);
  console.log('Video downloaded, size:', (fs.statSync(videoLocalPath).size / 1024 / 1024).toFixed(1), 'MB');

  // 2. Substitute videoUrl with the local file path (file:// URL)
  const inputProps = {
    ...job,
    videoUrl: 'file://' + videoLocalPath
  };

  // 3. Select composition
  const comp = await selectComposition({
    serveUrl: bundleLocation,
    id: 'TestimonialReel',
    inputProps
  });

  // 4. Render
  const outputPath = path.join(tmpDir, 'output.mp4');
  console.log(`Rendering ${comp.durationInFrames} frames at ${comp.fps}fps...`);
  await renderMedia({
    composition: comp,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    crf: 22,
    pixelFormat: 'yuv420p',
    onProgress: ({ progress }) => process.stdout.write(`  render: ${Math.round(progress * 100)}%\r`)
  });
  console.log('\nRender complete, size:', (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1), 'MB');

  // 5. Upload MP4 to GitHub Release
  console.log('Uploading MP4 to GitHub Release...');
  const tag = job.releaseTag || ('job-' + job.jobId);
  let release;
  try {
    release = (await octokit.repos.getReleaseByTag({ owner, repo, tag })).data;
  } catch {
    release = (await octokit.repos.createRelease({ owner, repo, tag_name: tag, name: 'Job ' + job.jobId })).data;
  }

  // Delete existing output.mp4 if any
  const existing = (release.assets || []).find(a => a.name === 'output.mp4');
  if (existing) await octokit.repos.deleteReleaseAsset({ owner, repo, asset_id: existing.id });

  const mp4Buf = fs.readFileSync(outputPath);
  const upload = await octokit.repos.uploadReleaseAsset({
    owner, repo, release_id: release.id,
    name: 'output.mp4', data: mp4Buf,
    headers: { 'content-type': 'video/mp4', 'content-length': mp4Buf.length }
  });

  // 6. Update job status
  await updateJob(job.jobId, {
    status: 'complete',
    render: {
      mp4Url: upload.data.browser_download_url,
      completedAt: new Date().toISOString(),
      error: null,
      sizeBytes: mp4Buf.length
    }
  });
  console.log(`✓ Job ${job.jobId} complete: ${upload.data.browser_download_url}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
