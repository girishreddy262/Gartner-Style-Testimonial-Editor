// JobStore - orchestrates GitHub (job.json + small assets + output) and Dropbox (video).
// Same shape as the localStorage stub from v0 but backed by real APIs.

(function (global) {
  'use strict';

  function makeJobId(name) {
    const slug = (name || 'job').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 24) || 'job';
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10);
    const rand = Math.random().toString(36).slice(2, 5);
    return slug + '-' + dateStr + '-' + rand;
  }

  const JobStore = {
    async listJobs() {
      return GitHubAPI.listJobs();
    },

    async getJob(jobId) {
      const r = await GitHubAPI.getJob(jobId);
      return r ? r.job : null;
    },

    async saveJob(job) {
      return GitHubAPI.saveJob(job);
    },

    async deleteJob(jobId) {
      // 1. Delete release (input + output assets)
      try { await GitHubAPI.deleteRelease('job-' + jobId); } catch (e) { console.warn(e); }
      // 2. Delete video from Dropbox
      try { await DropboxAPI.deleteFolder('/jobs/' + jobId); } catch (e) { console.warn(e); }
      // 3. Delete job.json
      await GitHubAPI.deleteJob(jobId);
    },

    // Create a new job: upload video to Dropbox, DOCX to GH release, write job.json
    async createJob({ videoFile, docxFile, parsed, onProgress }) {
      const jobId = makeJobId(parsed?.speaker?.name || 'project');

      const updateProgress = (stage, pct) => {
        if (onProgress) onProgress({ stage, pct });
      };

      // 1. Upload video to Dropbox (this is the slow one, usually 90% of time)
      updateProgress('Uploading video to Dropbox...', 0);
      const dropboxPath = await DropboxAPI.uploadVideo(jobId, videoFile, ({ loaded, total }) => {
        updateProgress('Uploading video to Dropbox...', Math.round((loaded / total) * 100));
      });

      // 2. Get direct-download URL for browser playback
      updateProgress('Getting video link...', 0);
      const videoUrl = await DropboxAPI.getDirectLink(dropboxPath);

      // 3. Create GitHub release for non-video assets
      updateProgress('Setting up project storage...', 0);
      const tag = 'job-' + jobId;
      const release = await GitHubAPI.ensureRelease(tag, 'Job ' + jobId);

      // 4. Upload DOCX as release asset (small, fast)
      updateProgress('Saving callouts document...', 0);
      await GitHubAPI.uploadAsset(release.id, 'callouts.docx', docxFile, ({ loaded, total }) => {
        updateProgress('Saving callouts document...', Math.round((loaded / total) * 100));
      });

      // 5. Build initial job state
      const now = new Date().toISOString();
      const job = {
        jobId,
        createdAt: now,
        updatedAt: now,
        status: 'editing',
        videoFileName: videoFile.name,
        videoSize: videoFile.size,
        dropboxVideoPath: dropboxPath,
        videoUrl,                            // direct-download for browser
        docxFileName: docxFile.name,
        speaker: parsed.speaker,
        introHeadline: parsed.introHeadline,
        scenes: parsed.scenes,
        introScene: {
          headline: parsed.introHeadline || '',
          name: parsed.speaker.name || '',
          role: parsed.speaker.designation || '',
          tag: '',
          portraitPath: null,
          logoPath: null
        },
        namecard: {
          name: parsed.speaker.name || '',
          designation: parsed.speaker.designation || ''
        },
        frameSettings: {
          full:   { x: 90,  y: 61,  w: 1766, h: 967 },
          shrunk: { x: 617, y: 112, w: 1241, h: 856 }
        },
        render: { mp4Url: null, completedAt: null, error: null },
        releaseTag: tag
      };

      // 6. Write job.json (this is what triggers things downstream)
      updateProgress('Finalizing project...', 0);
      await GitHubAPI.saveJob(job);

      return job;
    },

    // Upload an additional asset (portrait, logo) to the job's release.
    async uploadJobAsset(jobId, filename, file) {
      const tag = 'job-' + jobId;
      const release = await GitHubAPI.ensureRelease(tag, 'Job ' + jobId);
      await GitHubAPI.deleteAssetByName(release, filename);
      const asset = await GitHubAPI.uploadAsset(release.id, filename, file);
      return asset.browser_download_url;
    },

    // Refresh the video direct-link if it expires
    async refreshVideoUrl(job) {
      if (!job.dropboxVideoPath) return job.videoUrl;
      const url = await DropboxAPI.getDirectLink(job.dropboxVideoPath);
      job.videoUrl = url;
      await GitHubAPI.saveJob(job);
      return url;
    }
  };

  // Toast helper
  global.toast = function (msg, kind) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    }, 3500);
  };

  global.JobStore = JobStore;
})(window);
