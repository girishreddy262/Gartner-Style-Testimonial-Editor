// =============================================================================
// Darwin Reel: API client for the /api/darwin/* worker (v8-darwin).
// Plain <script src> include. Exposes window.DarwinAPI.
//
// Endpoint contract (confirmed against worker.js):
//   GET    /api/darwin                         -> { projects:[...] }
//   POST   /api/darwin           {title}       -> { project }
//   GET    /api/darwin/:id                      -> { project }
//   PUT    /api/darwin/:id       (partial)      -> { project }   (shallow top-level merge)
//   DELETE /api/darwin/:id                      -> { ok:true }
//   POST   /api/darwin/:id/duplicate            -> { project }
//   POST   /api/darwin/:id/upload-url {kind,fileName,contentType} -> { uploadUrl, s3Key }
//   GET    /api/darwin/:id/asset-get-url?key=   -> { url }
//   POST   /api/darwin/:id/parse {scriptText?,totalDuration?} -> { segments,captions,timestamps,stockClipsNeeded,sawAnyTimestamp }
//   POST   /api/darwin/:id/render               -> { status:'rendering', jobId }
//   GET    /api/darwin/:id/render-status        -> { status, mp4Url?, runUrl?, error?, logsUrl?, progress? }
// =============================================================================

(function () {
  const API_BASE =
    window.DARWIN_API_BASE ||
    'https://darwinbox-testimonial-api.girishreddy262.workers.dev';

  async function req(path, opts = {}) {
    const res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* non-JSON (e.g. 204) */ }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return data;
  }

  // PUT a File/Blob to a presigned S3 URL with progress. The worker signs the
  // PUT without binding Content-Type, so sending the real type is safe.
  function putToS3(uploadUrl, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      if (file.type) xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        (xhr.status >= 200 && xhr.status < 300)
          ? resolve()
          : reject(new Error(`S3 PUT failed: ${xhr.status} ${xhr.responseText?.slice(0, 200) || ''}`));
      xhr.onerror = () => reject(new Error('S3 PUT network error'));
      xhr.send(file);
    });
  }

  const DarwinAPI = {
    API_BASE,

    list:        ()              => req('/api/darwin').then(d => d.projects || []),
    create:      (title)         => req('/api/darwin', { method: 'POST', body: JSON.stringify({ title }) }).then(d => d.project),
    get:         (id)            => req(`/api/darwin/${id}`).then(d => d.project),
    update:      (id, patch)     => req(`/api/darwin/${id}`, { method: 'PUT', body: JSON.stringify(patch) }).then(d => d.project),
    remove:      (id)            => req(`/api/darwin/${id}`, { method: 'DELETE' }),
    duplicate:   (id)            => req(`/api/darwin/${id}/duplicate`, { method: 'POST' }).then(d => d.project),
    assetGetUrl: (id, key)       => req(`/api/darwin/${id}/asset-get-url?key=${encodeURIComponent(key)}`).then(d => d.url),
    parse:       (id, body = {}) => req(`/api/darwin/${id}/parse`, { method: 'POST', body: JSON.stringify(body) }),
    render:      (id)            => req(`/api/darwin/${id}/render`, { method: 'POST' }),
    renderStatus:(id)            => req(`/api/darwin/${id}/render-status`),

    uploadUrl: (id, kind, fileName, contentType) =>
      req(`/api/darwin/${id}/upload-url`, {
        method: 'POST',
        body: JSON.stringify({ kind, fileName, contentType }),
      }),

    // Convenience: get a presigned URL, PUT the file, return the s3Key.
    // kind = 'darwin' | 'stock' | 'music' | 'script'
    async uploadFile(id, kind, file, onProgress) {
      const { uploadUrl, s3Key } = await this.uploadUrl(
        id, kind, file.name || `${kind}.bin`, file.type || 'application/octet-stream'
      );
      await putToS3(uploadUrl, file, onProgress);
      return s3Key;
    },
  };

  window.DarwinAPI = DarwinAPI;
})();
