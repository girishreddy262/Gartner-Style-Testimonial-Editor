// Dropbox API wrapper - chunked upload for large video files.
//
// Uses upload_session_start/append_v2/finish to handle 1GB+ files reliably.
// Path scheme: /jobs/{jobId}/video.mp4

(function (global) {
  'use strict';

  const CHUNK_SIZE = 8 * 1024 * 1024;  // 8MB per chunk (Dropbox max is 150MB, smaller chunks = better progress)

  function token() {
    const c = Auth.creds();
    if (!c || !c.dropboxToken) throw new Error('Not authenticated');
    return c.dropboxToken;
  }

  // Upload a file in chunks. Returns the Dropbox path.
  // onProgress({ loaded, total })
  async function uploadVideo(jobId, file, onProgress) {
    const tk = token();
    const path = '/jobs/' + jobId + '/' + (file.name || 'video.mp4');
    const total = file.size;
    let offset = 0;
    let sessionId = null;

    while (offset < total) {
      const end = Math.min(offset + CHUNK_SIZE, total);
      const chunk = file.slice(offset, end);

      if (offset === 0) {
        // Start session
        const r = await fetch('https://content.dropboxapi.com/2/files/upload_session/start', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + tk,
            'Content-Type': 'application/octet-stream',
            'Dropbox-API-Arg': JSON.stringify({ close: false })
          },
          body: chunk
        });
        if (!r.ok) throw new Error('Dropbox start: ' + r.status + ' ' + (await r.text()).slice(0, 200));
        const data = await r.json();
        sessionId = data.session_id;
      } else if (end < total) {
        // Append
        const r = await fetch('https://content.dropboxapi.com/2/files/upload_session/append_v2', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + tk,
            'Content-Type': 'application/octet-stream',
            'Dropbox-API-Arg': JSON.stringify({
              cursor: { session_id: sessionId, offset: offset },
              close: false
            })
          },
          body: chunk
        });
        if (!r.ok) throw new Error('Dropbox append: ' + r.status + ' ' + (await r.text()).slice(0, 200));
      } else {
        // Final chunk - finish
        const r = await fetch('https://content.dropboxapi.com/2/files/upload_session/finish', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + tk,
            'Content-Type': 'application/octet-stream',
            'Dropbox-API-Arg': JSON.stringify({
              cursor: { session_id: sessionId, offset: offset },
              commit: { path: path, mode: 'overwrite', autorename: false, mute: true }
            })
          },
          body: chunk
        });
        if (!r.ok) throw new Error('Dropbox finish: ' + r.status + ' ' + (await r.text()).slice(0, 200));
      }

      offset = end;
      if (onProgress) onProgress({ loaded: offset, total });
    }

    return path;
  }

  // Get a temporary direct-download link (4-hour TTL). Used by the renderer.
  // For browser playback we use a shareable link converted to dl.dropboxusercontent.com.
  async function getTemporaryLink(path) {
    const r = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path })
    });
    if (!r.ok) throw new Error('Dropbox temp link: ' + r.status);
    const data = await r.json();
    return data.link;
  }

  // Create a permanent shareable link, return a direct-download URL the browser can stream.
  async function getDirectLink(path) {
    // Try to create a shared link
    let url = null;
    const create = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path, settings: { requested_visibility: 'public' } })
    });
    if (create.ok) {
      const data = await create.json();
      url = data.url;
    } else {
      // Already exists - list and grab
      const list = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path })
      });
      if (!list.ok) throw new Error('Dropbox share list: ' + list.status);
      const data = await list.json();
      if (!data.links || data.links.length === 0) throw new Error('No shared link for ' + path);
      url = data.links[0].url;
    }
    // Convert to direct-download URL
    return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '').replace('?dl=1', '');
  }

  async function deleteFile(path) {
    const r = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path })
    });
    return r.ok;
  }

  async function deleteFolder(path) {
    // delete_v2 deletes folders too
    return deleteFile(path);
  }

  global.DropboxAPI = {
    uploadVideo,
    getTemporaryLink,
    getDirectLink,
    deleteFile,
    deleteFolder
  };
})(window);
