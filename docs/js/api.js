// Single API client for the testimonial editor.
// Calls the Cloudflare Worker which fronts S3 + Lambda + KV.
//
// Worker URL is configured once at the top of this file. No tokens in browser.

(function (global) {
  'use strict';

  // ── Configure this URL after deploying the Worker ────────────────────────
  const API_BASE = 'https://darwinbox-testimonial-api.girishreddy262.workers.dev';

  async function http(path, opts = {}) {
    const url = API_BASE + path;
    const init = { ...opts };
    if (init.body && typeof init.body === 'object' && !(init.body instanceof FormData)) {
      init.headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
      init.body = JSON.stringify(init.body);
    }
    const r = await fetch(url, init);
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.json()).error || ''; } catch {}
      throw new Error(`API ${r.status}: ${detail || r.statusText}`);
    }
    return r.json();
  }

  const API = {
    // Project CRUD
    async listProjects() {
      const r = await http('/api/projects');
      return r.projects || [];
    },
    async getProject(projectId) {
      const r = await http(`/api/projects/${encodeURIComponent(projectId)}`);
      return r.project;
    },
    async createProject(initial) {
      const r = await http('/api/projects', { method: 'POST', body: initial });
      return r.project;
    },
    async updateProject(projectId, patch) {
      const r = await http(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'PUT', body: patch
      });
      return r.project;
    },
    async deleteProject(projectId) {
      await http(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    },
    async duplicateProject(projectId) {
      const r = await http(`/api/projects/${encodeURIComponent(projectId)}/duplicate`, { method: 'POST' });
      return r.project;
    },

    // Video upload (presigned PUT to S3)
    async getVideoUploadUrl(projectId, fileName, contentType) {
      const r = await http(`/api/projects/${encodeURIComponent(projectId)}/upload-url`, {
        method: 'POST', body: { fileName, contentType }
      });
      return r;  // { uploadUrl, s3Key }
    },
    // Asset upload (portraits/logos)
    async getAssetUploadUrl(projectId, fileName, contentType) {
      const r = await http(`/api/projects/${encodeURIComponent(projectId)}/asset-upload-url`, {
        method: 'POST', body: { fileName, contentType }
      });
      return r;  // { uploadUrl, s3Key, publicUrl }
    },
    // Direct upload helper — uploads a File to a presigned URL with progress
    uploadToPresigned(file, presignedUrl, onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress({ loaded: e.loaded, total: e.total });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText.slice(0, 200)}`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });
    },

    // Get a fresh presigned GET URL for browser video playback
    async getVideoPlaybackUrl(projectId) {
      const r = await http(`/api/projects/${encodeURIComponent(projectId)}/video-url`);
      return r.videoUrl;
    },

    // Render
    async triggerRender(projectId) {
      const r = await http(`/api/projects/${encodeURIComponent(projectId)}/render`, { method: 'POST' });
      return r;  // { status, renderId }
    },
    async getRenderStatus(projectId) {
      const r = await http(`/api/projects/${encodeURIComponent(projectId)}/render-status`);
      return r;  // { status, progress?, mp4Url?, error? }
    }
  };

  global.API = API;

  // Toast helper (shared)
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
})(window);
