// GitHub REST API wrapper for testimonial editor.
//
// Job files live at: jobs/{jobId}.json
// Input assets live as Release assets on tag: job-{jobId}
// Output MP4 lives as a Release asset on the same tag.

(function (global) {
  'use strict';

  function api() {
    const c = Auth.creds();
    if (!c) throw new Error('Not authenticated');
    return c;
  }

  async function gh(path, opts) {
    const c = api();
    opts = opts || {};
    const headers = Object.assign({
      Authorization: 'Bearer ' + c.githubToken,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, opts.headers || {});
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData) && !(opts.body instanceof Blob)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const url = path.startsWith('http') ? path : ('https://api.github.com/repos/' + c.githubOwner + '/' + c.githubRepo + path);
    const r = await fetch(url, Object.assign({}, opts, { headers }));
    if (!r.ok && r.status !== 404) {
      const text = await r.text();
      throw new Error('GitHub API ' + r.status + ': ' + text.slice(0, 200));
    }
    return r;
  }

  // ── Job files ─────────────────────────────────────────────────────────
  async function getJob(jobId) {
    const r = await gh('/contents/jobs/' + encodeURIComponent(jobId) + '.json');
    if (r.status === 404) return null;
    const data = await r.json();
    const content = atob(data.content.replace(/\s/g, ''));
    return { job: JSON.parse(content), sha: data.sha };
  }

  async function listJobs() {
    const r = await gh('/contents/jobs');
    if (r.status === 404) return [];
    const items = await r.json();
    const jobs = [];
    for (const item of items) {
      if (!item.name.endsWith('.json')) continue;
      try {
        const data = await fetch(item.download_url).then(x => x.json());
        jobs.push(data);
      } catch (e) {
        console.warn('Could not load', item.name, e);
      }
    }
    return jobs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async function saveJob(job) {
    job.updatedAt = new Date().toISOString();
    const path = '/contents/jobs/' + encodeURIComponent(job.jobId) + '.json';
    // Need the current sha to update
    let sha = null;
    const existing = await gh(path);
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }
    const body = {
      message: (sha ? 'Update' : 'Create') + ' job ' + job.jobId,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(job, null, 2))))
    };
    if (sha) body.sha = sha;
    const r = await gh(path, { method: 'PUT', body });
    if (!r.ok) throw new Error('Failed to save job');
    return r.json();
  }

  async function deleteJob(jobId) {
    const path = '/contents/jobs/' + encodeURIComponent(jobId) + '.json';
    const existing = await gh(path);
    if (existing.status === 404) return;
    const data = await existing.json();
    const r = await gh(path, {
      method: 'DELETE',
      body: { message: 'Delete job ' + jobId, sha: data.sha }
    });
    if (!r.ok) throw new Error('Failed to delete job');
    // Also delete the release (best-effort)
    try { await deleteRelease('job-' + jobId); } catch (e) { console.warn(e); }
  }

  // ── Releases (for asset storage) ──────────────────────────────────────
  async function getRelease(tag) {
    const r = await gh('/releases/tags/' + encodeURIComponent(tag));
    if (r.status === 404) return null;
    return r.json();
  }

  async function ensureRelease(tag, name) {
    const existing = await getRelease(tag);
    if (existing) return existing;
    const r = await gh('/releases', {
      method: 'POST',
      body: { tag_name: tag, name: name || tag, draft: false, prerelease: false }
    });
    return r.json();
  }

  async function deleteRelease(tag) {
    const rel = await getRelease(tag);
    if (!rel) return;
    await gh('/releases/' + rel.id, { method: 'DELETE' });
    // Also delete the tag itself (releases tags hang around otherwise)
    try { await gh('/git/refs/tags/' + tag, { method: 'DELETE' }); } catch (e) {}
  }

  // Upload an asset to a release. file is a Blob/File.
  // Calls onProgress({ loaded, total }) periodically.
  async function uploadAsset(releaseId, filename, file, onProgress) {
    const c = api();
    const url = 'https://uploads.github.com/repos/' + c.githubOwner + '/' + c.githubRepo +
                '/releases/' + releaseId + '/assets?name=' + encodeURIComponent(filename);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + c.githubToken);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress({ loaded: e.loaded, total: e.total });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(new Error('Asset upload failed: ' + xhr.status + ' ' + xhr.responseText.slice(0, 200)));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(file);
    });
  }

  // Delete an asset by name from a release (used when overwriting)
  async function deleteAssetByName(release, filename) {
    if (!release.assets) return;
    const existing = release.assets.find(a => a.name === filename);
    if (!existing) return;
    await gh('/releases/assets/' + existing.id, { method: 'DELETE' });
  }

  // ── Workflow trigger (kicks the renderer) ─────────────────────────────
  async function triggerWorkflow(workflowFile, ref, inputs) {
    const r = await gh('/actions/workflows/' + encodeURIComponent(workflowFile) + '/dispatches', {
      method: 'POST',
      body: { ref: ref || 'main', inputs: inputs || {} }
    });
    return r.ok;
  }

  global.GitHubAPI = {
    getJob, listJobs, saveJob, deleteJob,
    getRelease, ensureRelease, deleteRelease,
    uploadAsset, deleteAssetByName,
    triggerWorkflow
  };
})(window);
