// Auth: stores GitHub PAT, Dropbox token, and repo info in localStorage.
// Shows a first-run modal if any are missing. Once stored, every page can use Auth.creds().
//
// Storage key: 'testimonial.auth.v1'
// Shape: { githubToken, githubOwner, githubRepo, dropboxToken }

(function (global) {
  'use strict';
  const KEY = 'testimonial.auth.v1';

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function write(obj) { localStorage.setItem(KEY, JSON.stringify(obj)); }
  function clear() { localStorage.removeItem(KEY); }

  function isConfigured() {
    const c = read();
    return !!(c && c.githubToken && c.githubOwner && c.githubRepo && c.dropboxToken);
  }

  function showSetupModal(onSaved) {
    const existing = read() || {};
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.zIndex = 200;
    modal.innerHTML = `
      <div class="modal" style="width: 580px; max-width: 92vw;">
        <div class="modal-header">
          <div class="modal-title">First-time setup</div>
        </div>
        <div class="modal-body">
          <p style="font-size: 12px; color: #9ca3af; margin: 0 0 18px; line-height: 1.5;">
            Paste your GitHub and Dropbox tokens to enable saving projects. They're stored locally in your browser only — never uploaded anywhere except to GitHub/Dropbox APIs.
          </p>

          <div class="frame-preset">
            <div class="frame-preset-label">GitHub</div>
            <div style="margin-bottom: 10px;">
              <div class="insp-label">Repo owner (your username or org)</div>
              <input type="text" class="insp-input" id="setupOwner" placeholder="girishreddy262" value="${escAttr(existing.githubOwner || '')}">
            </div>
            <div style="margin-bottom: 10px;">
              <div class="insp-label">Repo name</div>
              <input type="text" class="insp-input" id="setupRepo" placeholder="testimonial-callout-editor" value="${escAttr(existing.githubRepo || '')}">
            </div>
            <div>
              <div class="insp-label">Personal access token (fine-grained, with Contents R/W + Workflows R/W)</div>
              <input type="password" class="insp-input" id="setupGhToken" placeholder="github_pat_..." value="${escAttr(existing.githubToken || '')}">
            </div>
          </div>

          <div class="frame-preset">
            <div class="frame-preset-label">Dropbox</div>
            <div>
              <div class="insp-label">Access token (from Dropbox app settings)</div>
              <input type="password" class="insp-input" id="setupDbxToken" placeholder="sl..." value="${escAttr(existing.dropboxToken || '')}">
            </div>
          </div>

          <div id="setupStatus" style="font-size: 11px; min-height: 16px; margin-bottom: 8px;"></div>

          <div class="modal-actions">
            <button class="btn" id="setupTest">Test connection</button>
            <button class="btn btn-primary" id="setupSave">Save and continue</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const $ = id => modal.querySelector('#' + id);
    const status = (msg, kind) => {
      const el = $('setupStatus');
      el.textContent = msg;
      el.style.color = kind === 'ok' ? '#86efac' : (kind === 'err' ? '#f87171' : '#9ca3af');
    };

    $('setupTest').onclick = async () => {
      status('Testing...', '');
      const creds = collect();
      if (!creds.githubToken || !creds.dropboxToken) {
        status('Fill in all fields first.', 'err'); return;
      }
      try {
        const ghOk = await testGithub(creds);
        if (!ghOk) { status('GitHub: repo/token invalid or no access.', 'err'); return; }
        const dbxOk = await testDropbox(creds);
        if (!dbxOk) { status('Dropbox: token invalid.', 'err'); return; }
        status('✓ Both connections working.', 'ok');
      } catch (e) {
        status('Error: ' + e.message, 'err');
      }
    };

    $('setupSave').onclick = () => {
      const creds = collect();
      if (!creds.githubToken || !creds.githubOwner || !creds.githubRepo || !creds.dropboxToken) {
        status('All fields required.', 'err'); return;
      }
      write(creds);
      modal.remove();
      if (onSaved) onSaved(creds);
    };

    function collect() {
      return {
        githubOwner: $('setupOwner').value.trim(),
        githubRepo: $('setupRepo').value.trim(),
        githubToken: $('setupGhToken').value.trim(),
        dropboxToken: $('setupDbxToken').value.trim()
      };
    }
  }

  async function testGithub(creds) {
    const r = await fetch(`https://api.github.com/repos/${creds.githubOwner}/${creds.githubRepo}`, {
      headers: { Authorization: 'Bearer ' + creds.githubToken, Accept: 'application/vnd.github+json' }
    });
    return r.ok;
  }

  async function testDropbox(creds) {
    const r = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + creds.dropboxToken }
    });
    return r.ok;
  }

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  global.Auth = {
    creds: read,
    isConfigured,
    showSetupModal,
    clear,
    requireOrPrompt(onReady) {
      if (isConfigured()) { onReady(read()); return; }
      showSetupModal(onReady);
    },
    openSettings() {
      showSetupModal(() => location.reload());
    }
  };
})(window);
