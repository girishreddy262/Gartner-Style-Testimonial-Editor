// Editor entry point. Reads projectId from URL, loads project from Worker API, wires up everything.
(async function () {
'use strict';

// ── Constants ───────────────────────────────────────────────────────────
const INTRO_END = 5;
const VIDEO_START = 5;
const CANVAS_W = 1920, CANVAS_H = 1080;
const NAMECARD_PRESET = { right: 60, bottom: 110 };
const LAYOUT_DEFS = [
  { key: 'bullets_with_inline_metric', label: 'Title + bullets' },
  { key: 'bullets_with_icons',         label: 'Icon bullets' },
  { key: 'simple_metric',              label: 'Simple metric' },
  { key: 'tagpill_metric_before_after',label: 'Tag pill: before → after' },
  { key: 'metric_with_subtext',        label: 'Standalone metric' },
  { key: 'icon_count',                 label: 'Icon + count' },
  { key: 'time_comparison',            label: 'Time comparison' },
  { key: 'title_only_dark',            label: 'Title only' },
  { key: 'country_bullets',            label: 'Country bullets' },
  { key: 'dual_section_bullets',       label: 'Dual section bullets' }
];
const ICON_MAP = {
  industry: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M14 6h-4V4h4v2zm6 4v9c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2v-9c0-1.1.9-2 2-2h2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v4h2c1.1 0 2 .9 2 2z"/></svg>',
  people:   '<svg viewBox="0 0 24 24" fill="#fff"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
  location: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'
};

// ── Load project ────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const projectId = params.get('projectId') || params.get('jobId'); // support both for transition
if (!projectId) {
  alert('No project selected. Returning to projects.');
  window.location.href = 'index.html';
  return;
}

let job;
try {
  job = await API.getProject(projectId);
} catch (e) {
  alert('Could not load project: ' + e.message);
  window.location.href = 'index.html';
  return;
}
if (!job) {
  alert('Project not found. Returning to projects.');
  window.location.href = 'index.html';
  return;
}

// Get a fresh presigned video URL for playback (the one in the project may have expired)
try {
  if (job.s3VideoKey) {
    const fresh = await API.getVideoPlaybackUrl(projectId);
    job.videoUrl = fresh;
  }
} catch (e) {
  console.warn('Could not fetch video URL:', e);
}

// ── State assembly ──────────────────────────────────────────────────────
// Combine the parsed scenes from the DOCX with the intro/namecard objects we
// keep separately. The scenes list shown in the editor includes a synthetic
// "intro" and "namecard" at the start, then the DOCX-parsed scenes.

function buildScenes() {
  const scenes = [];

  // Intro is always at 0–5s
  if (job.introScene) {
    scenes.push({
      id: 'intro',
      type: 'intro',
      name: 'Intro',
      start: 0,
      end: INTRO_END,
      props: { ...job.introScene }
    });
  }

  // Namecard spans the whole video portion (5s → end)
  if (job.namecard) {
    scenes.push({
      id: 'namecard',
      type: 'namecard',
      name: 'Namecard',
      start: VIDEO_START,
      end: 99999,  // resolved later when video duration known
      props: { ...job.namecard }
    });
  }

  // DOCX-parsed scenes
  (job.scenes || []).forEach((s, i) => {
    const sceneCopy = JSON.parse(JSON.stringify(s));
    sceneCopy.id = sceneCopy.id || ('s' + i);
    sceneCopy.name = sceneCopy.name || sceneNameFor(sceneCopy);
    sceneCopy._savedProps = sceneCopy._savedProps || {};
    scenes.push(sceneCopy);
  });

  return scenes;
}

function sceneNameFor(s) {
  if (s.type === 'meta') return 'Meta intro';
  if (s.layout === 'title_only_dark') return s.props.title ? s.props.title.slice(0, 30) : 'Title only';
  return s.props.title ? s.props.title.slice(0, 30) : 'Callout';
}

const scenes = buildScenes();
let totalDuration = job.totalDuration || 0;  // resolved from video.onloadedmetadata
let activeId = scenes[0]?.id || null;
let currentTime = 0;
let isPlaying = false;
let lastTick = 0;
let zoom = 1;

const geometry = job.frameSettings || {
  full:   { x: 90, y: 61, w: 1766, h: 967 },
  shrunk: { x: 617, y: 112, w: 1241, h: 856 }
};

// ── DOM refs ────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const stageInner = $('stageInner');
const video = $('bgVideo');
const videoPlaceholder = $('videoPlaceholder');
const introLayer = $('introLayer');
const videoLayer = $('videoLayer');
const frame = $('frameGroup');
const namecardEl = $('namecardEl');
const calloutEl = $('calloutEl');
const headlineEl = $('introHeadline');
const portraitEl = $('introPortrait');
const introMetaEl = $('introMeta');

// ── Helpers ─────────────────────────────────────────────────────────────
function fmtTime(s) {
  if (s === null || s === undefined || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}

function parseTimeInput(str) {
  const m = String(str).trim().match(/^(\d+):(\d+)$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return null;
}

function activeScene() { return scenes.find(s => s.id === activeId); }

function fitStage() {
  const rect = stage.getBoundingClientRect();
  const scale = rect.width / CANVAS_W;
  stageInner.style.transform = 'scale(' + scale + ')';
  stage.style.height = (CANVAS_H * scale) + 'px';
}

// ── Debounced async save ────────────────────────────────────────────────
let persistTimer = null;
let savingNow = false;
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    if (savingNow) { persistTimer = setTimeout(persist, 500); return; }
    savingNow = true;
    try {
      const cleanScenes = scenes
        .filter(s => s.type !== 'intro' && s.type !== 'namecard')
        .map(({ _savedProps, ...rest }) => rest);
      const introSceneObj = scenes.find(s => s.type === 'intro')?.props;
      const namecardObj = scenes.find(s => s.type === 'namecard')?.props;
      const updated = await API.updateProject(projectId, {
        ...job,
        scenes: cleanScenes,
        introScene: introSceneObj,
        namecard: namecardObj,
        frameSettings: geometry,
        totalDuration
      });
      job = updated;
      const st = document.getElementById('statusText');
      if (st) st.textContent = 'Saved ' + new Date().toLocaleTimeString();
    } catch (e) {
      console.error('Save failed:', e);
      const st = document.getElementById('statusText');
      if (st) { st.textContent = 'Save failed — ' + e.message; st.style.color = '#f87171'; }
    } finally {
      savingNow = false;
    }
  }, 800);  // 800ms debounce
}

// ── Video loading ───────────────────────────────────────────────────────
if (job.videoUrl) {
  video.src = job.videoUrl;
  video.crossOrigin = 'anonymous';
  video.style.display = 'block';
  videoPlaceholder.style.display = 'none';
  video.addEventListener('loadedmetadata', () => {
    totalDuration = video.duration + INTRO_END;
    // resolve the namecard's end to the video end
    const nc = scenes.find(s => s.type === 'namecard');
    if (nc) nc.end = totalDuration;
    persist();
    renderAll();
  });
  video.addEventListener('error', () => {
    video.style.display = 'none';
    videoPlaceholder.style.display = 'flex';
    videoPlaceholder.textContent = 'Could not load video';
  });
  video.addEventListener('timeupdate', () => {
    if (!isPlaying) return;
    currentTime = VIDEO_START + video.currentTime;
    if (currentTime >= totalDuration) {
      isPlaying = false;
      video.pause();
      $('statusText').textContent = 'Ended';
    }
    syncToTime();
  });
} else {
  videoPlaceholder.style.display = 'flex';
  totalDuration = 120; // fallback
}

// If no video duration yet, use a reasonable default so we can render timeline
if (!totalDuration) totalDuration = 120;

// ── Scenes list (left rail) ─────────────────────────────────────────────
function renderScenes() {
  const list = $('sceneList');
  list.innerHTML = scenes.map(s => {
    const colorMap = {
      intro: '#7c3aed', namecard: '#fbbf24', meta: '#0d9488', content: '#2563eb'
    };
    const color = colorMap[s.type] || '#6b7280';
    const isActive = activeId === s.id;
    const timeLabel = (s.type === 'namecard') ? '5:00 – end'
                      : (fmtTime(s.start) + ' – ' + fmtTime(s.end));
    return `<div class="scene-item ${isActive ? 'active' : ''}" data-scene="${s.id}" style="border-left-color:${color}">
      <div class="scene-item-name">${escapeHtml(s.name || sceneNameFor(s))}</div>
      <div class="scene-item-meta">${timeLabel}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-scene]').forEach(el => {
    el.onclick = () => selectScene(el.dataset.scene);
  });
}

function selectScene(id) {
  activeId = id;
  const s = activeScene();
  if (s && s.type !== 'namecard' && s.type !== 'intro') {
    currentTime = s.start + 0.5;
  } else if (s && s.type === 'intro') {
    currentTime = 1;
  } else if (s && s.type === 'namecard') {
    currentTime = VIDEO_START + 2;
  }
  if (video.src) {
    try { video.currentTime = Math.max(0, currentTime - VIDEO_START); } catch (e) {}
  }
  renderScenes();
  renderTimeline();
  renderInspector();
  syncToTime();
  updatePlayhead();
}

// ── Inspector ───────────────────────────────────────────────────────────
function renderInspector() {
  const s = activeScene();
  const body = $('inspectorBody');
  if (!s) { body.innerHTML = 'Select a scene to edit'; return; }

  let html = `<div style="font-size:13px;font-weight:600;color:#e5e7eb;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #1f2937;">
    ${escapeHtml(s.name || sceneNameFor(s))}
  </div>`;

  // Time
  if (s.type !== 'namecard') {
    html += `<div class="insp-section">
      <div class="insp-label">Time</div>
      <div class="insp-time-row">
        <input type="text" class="insp-input" data-time="start" value="${fmtTime(s.start)}">
        <span style="color:#6b7280;font-size:10px;">to</span>
        <input type="text" class="insp-input" data-time="end" value="${fmtTime(s.end)}">
      </div>
    </div>`;
  } else {
    html += `<div class="insp-section">
      <div class="insp-label">Display</div>
      <div style="font-size:11px;color:#6b7280;">Shown for the entire speaker portion (5:00 to end of video).</div>
    </div>`;
  }

  // Type-specific fields
  if (s.type === 'intro') {
    html += textField('Headline', 'headline', s.props.headline);
    html += textField('Speaker name', 'name', s.props.name);
    html += textField('Role / designation', 'role', s.props.role);
    html += textField('Tagline (industry, headcount, location)', 'tag', s.props.tag);
    html += `<div class="insp-section">
      <div class="insp-label">Portrait image</div>
      <input type="file" accept="image/*" data-image="portraitPath" style="font-size:11px;color:#9ca3af;">
    </div>`;
    html += `<div class="insp-section">
      <div class="insp-label">Customer logo</div>
      <input type="file" accept="image/*" data-image="logoPath" style="font-size:11px;color:#9ca3af;">
    </div>`;
  } else if (s.type === 'namecard') {
    html += textField('Speaker name', 'name', s.props.name);
    html += textField('Designation', 'designation', s.props.designation);
  } else if (s.type === 'meta') {
    html += `<div class="insp-section">
      <div class="insp-label">Items</div>
      ${s.props.items.map((it, i) => `
        <div class="insp-bullet-card">
          <div class="insp-bullet-head">
            <span>${it.icon}</span>
            <span>@ ${fmtTime(s.bulletTimings?.[i] || 0)}</span>
          </div>
          <input type="text" class="insp-input" data-item="${i}" value="${escapeAttr(it.text)}">
        </div>
      `).join('')}
    </div>`;
  } else if (s.type === 'content') {
    html += `<div class="insp-section">
      <div class="insp-label">Layout</div>
      <select class="insp-select" data-layout>
        ${LAYOUT_DEFS.map(l => `<option value="${l.key}" ${s.layout === l.key ? 'selected' : ''}>${l.label}</option>`).join('')}
      </select>
    </div>`;
    html += inspectorForLayout(s);
  }

  body.innerHTML = html;
  wireInspectorEvents();
}

function textField(label, key, val) {
  return `<div class="insp-section">
    <div class="insp-label">${label}</div>
    <input type="text" class="insp-input" data-prop="${key}" value="${escapeAttr(val || '')}">
  </div>`;
}

function inspectorForLayout(s) {
  const p = s.props;
  const l = s.layout;
  let html = '';

  if (l === 'bullets_with_inline_metric' || l === 'bullets_with_icons' || l === 'country_bullets') {
    if (l === 'country_bullets') {
      html += textField('Country', 'country', p.country);
    } else {
      html += textField('Title', 'title', p.title);
    }
    html += `<div class="insp-section">
      <div class="insp-label">Bullets</div>
      ${(p.bullets || []).map((b, i) => `
        <div class="insp-bullet-card">
          <div class="insp-bullet-head">
            <span>Bullet ${i + 1}</span>
            <span>@ ${fmtTime(s.bulletTimings?.[i] || 0)}</span>
          </div>
          <textarea class="insp-textarea" data-bullet="${i}">${escapeHtml(b.text || '')}</textarea>
        </div>
      `).join('')}
      <button class="btn btn-ghost" data-add-bullet style="width:100%;justify-content:flex-start;margin-top:4px;">+ Add bullet</button>
    </div>`;
  } else if (l === 'simple_metric') {
    html += textField('Title', 'title', p.title);
    html += textField('Metric', 'metric', p.metric);
    html += textField('Caption', 'caption', p.caption);
  } else if (l === 'tagpill_metric_before_after') {
    html += textField('Tag pill', 'tag', p.tag);
    html += textField('Before', 'before', p.before);
    html += textField('After', 'after', p.after);
    html += textField('Metric headline', 'metric', p.metric);
    html += textField('Caption', 'caption', p.caption);
  } else if (l === 'metric_with_subtext') {
    html += textField('Metric (% or number)', 'metric', p.metric);
    html += textField('Label', 'label', p.label);
    html += textField('Caption', 'caption', p.caption);
  } else if (l === 'icon_count') {
    html += textField('Count', 'count', p.count);
    html += textField('Label', 'label', p.label);
  } else if (l === 'time_comparison') {
    html += textField('Title', 'title', p.title);
    html += `<div class="insp-section">
      <div class="insp-label">Before</div>
      <div class="insp-row">
        <input type="text" class="insp-input" data-prop="beforeValue" value="${escapeAttr(p.beforeValue || '')}" placeholder="2">
        <input type="text" class="insp-input" data-prop="beforeUnit" value="${escapeAttr(p.beforeUnit || '')}" placeholder="Months">
      </div>
    </div>`;
    html += `<div class="insp-section">
      <div class="insp-label">After</div>
      <div class="insp-row">
        <input type="text" class="insp-input" data-prop="afterValue" value="${escapeAttr(p.afterValue || '')}" placeholder="2">
        <input type="text" class="insp-input" data-prop="afterUnit" value="${escapeAttr(p.afterUnit || '')}" placeholder="Minutes">
      </div>
    </div>`;
  } else if (l === 'title_only_dark') {
    html += textField('Title', 'title', p.title);
  } else if (l === 'dual_section_bullets') {
    html += textField('Header title', 'title', p.title);
    html += `<div class="insp-section">
      <div class="insp-label">Section A</div>
      <input type="text" class="insp-input" data-prop="sectionAName" value="${escapeAttr(p.sectionAName || '')}" placeholder="Empowerment" style="margin-bottom:6px;">
      ${(p.sectionA || []).map((b, i) => `
        <textarea class="insp-textarea" data-section-bullet="A:${i}">${escapeHtml(b)}</textarea>
      `).join('')}
    </div>`;
    html += `<div class="insp-section">
      <div class="insp-label">Section B</div>
      <input type="text" class="insp-input" data-prop="sectionBName" value="${escapeAttr(p.sectionBName || '')}" placeholder="Engagement" style="margin-bottom:6px;">
      ${(p.sectionB || []).map((b, i) => `
        <textarea class="insp-textarea" data-section-bullet="B:${i}">${escapeHtml(b)}</textarea>
      `).join('')}
    </div>`;
  }

  return html;
}

function wireInspectorEvents() {
  const s = activeScene();
  if (!s) return;
  const body = $('inspectorBody');

  body.querySelectorAll('[data-prop]').forEach(inp => {
    inp.oninput = () => {
      s.props[inp.dataset.prop] = inp.value;
      renderCanvas();
      persist();
    };
  });
  body.querySelectorAll('[data-time]').forEach(inp => {
    inp.onchange = () => {
      const t = parseTimeInput(inp.value);
      if (t !== null) {
        s[inp.dataset.time] = t;
        renderScenes();
        renderTimeline();
        persist();
      }
    };
  });
  body.querySelectorAll('[data-layout]').forEach(sel => {
    sel.onchange = () => {
      const prev = s.layout;
      s._savedProps = s._savedProps || {};
      s._savedProps[prev] = JSON.parse(JSON.stringify(s.props));
      s.layout = sel.value;
      if (s._savedProps[s.layout]) {
        s.props = JSON.parse(JSON.stringify(s._savedProps[s.layout]));
      } else {
        s.props = defaultPropsFor(s.layout, s.props);
      }
      renderInspector();
      renderCanvas();
      persist();
    };
  });
  body.querySelectorAll('[data-bullet]').forEach(ta => {
    ta.oninput = () => {
      const i = parseInt(ta.dataset.bullet, 10);
      s.props.bullets[i].text = ta.value;
      renderCanvas();
      persist();
    };
  });
  body.querySelectorAll('[data-item]').forEach(inp => {
    inp.oninput = () => {
      const i = parseInt(inp.dataset.item, 10);
      s.props.items[i].text = inp.value;
      renderCanvas();
      persist();
    };
  });
  body.querySelectorAll('[data-section-bullet]').forEach(ta => {
    ta.oninput = () => {
      const [section, idx] = ta.dataset.sectionBullet.split(':');
      const key = section === 'A' ? 'sectionA' : 'sectionB';
      if (!s.props[key]) s.props[key] = [];
      s.props[key][parseInt(idx, 10)] = ta.value;
      renderCanvas();
      persist();
    };
  });
  body.querySelectorAll('[data-add-bullet]').forEach(btn => {
    btn.onclick = () => {
      if (!s.props.bullets) s.props.bullets = [];
      s.props.bullets.push({ text: 'New bullet' });
      // Insert a bullet timing
      const dur = s.end - s.start;
      const lastTime = s.bulletTimings?.[s.bulletTimings.length - 1] || s.start;
      s.bulletTimings = (s.bulletTimings || []).concat([Math.min(s.end - 1, lastTime + 3)]);
      renderInspector();
      renderTimeline();
      renderCanvas();
      persist();
    };
  });
  body.querySelectorAll('[data-image]').forEach(inp => {
    inp.onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const field = inp.dataset.image;
      const tempUrl = URL.createObjectURL(f);
      s.props[field] = tempUrl;
      renderCanvas();
      toast('Uploading ' + f.name + '...', 'info');
      try {
        const fileName = field + (f.name.match(/\.\w+$/) || ['.png'])[0];
        const { uploadUrl, publicUrl } = await API.getAssetUploadUrl(projectId, fileName, f.type || 'image/png');
        await API.uploadToPresigned(f, uploadUrl);
        s.props[field] = publicUrl;
        renderCanvas();
        persist();
        toast('Image uploaded', 'success');
      } catch (err) {
        toast('Image upload failed: ' + err.message, 'error');
      }
    };
  });
}

function defaultPropsFor(layout, oldProps) {
  const p = oldProps || {};
  if (layout === 'bullets_with_inline_metric' || layout === 'bullets_with_icons') {
    return { title: p.title || 'Title', bullets: p.bullets || [{ text: 'Bullet 1' }, { text: 'Bullet 2' }] };
  }
  if (layout === 'simple_metric') return { title: p.title || 'Title', metric: '70%', caption: 'Caption' };
  if (layout === 'tagpill_metric_before_after') return { tag: 'LOP', before: '40000', after: '12000', metric: '70% reduction', caption: 'Caption' };
  if (layout === 'metric_with_subtext') return { metric: '33-40%', label: 'Increase', caption: 'Caption' };
  if (layout === 'icon_count') return { count: '25 Systems', label: 'integrated with Darwinbox' };
  if (layout === 'time_comparison') return { title: p.title || 'Faster', beforeValue: '2', beforeUnit: 'Months', afterValue: '2', afterUnit: 'Minutes' };
  if (layout === 'title_only_dark') return { title: p.title || 'Title' };
  if (layout === 'country_bullets') return { country: 'Country', bullets: [{ text: 'Bullet 1' }, { text: 'Bullet 2' }] };
  if (layout === 'dual_section_bullets') return { title: p.title || 'Section title', sectionAName: 'Section A', sectionA: ['Bullet 1', 'Bullet 2'], sectionBName: 'Section B', sectionB: ['Bullet 1'] };
  return {};
}

// ── Timeline ────────────────────────────────────────────────────────────
function renderTimeline() {
  const bar = $('timelineBar');
  // Resize bar width by zoom
  bar.style.width = (100 * zoom) + '%';

  $('totalTime').textContent = fmtTime(totalDuration);

  // Clear children except playhead and overlay
  bar.querySelectorAll('.tl-seg, .tl-bullet').forEach(el => el.remove());

  const colorMap = { intro: '#7c3aed', namecard: '#fbbf24', meta: '#0d9488', content: '#2563eb' };

  scenes.forEach(s => {
    if (s.type === 'namecard') {
      // Render as a thin band at the bottom
      const left = (s.start / totalDuration) * 100;
      const width = ((Math.min(s.end, totalDuration) - s.start) / totalDuration) * 100;
      const seg = document.createElement('div');
      seg.className = 'tl-seg' + (activeId === s.id ? ' active' : '');
      seg.style.cssText = `left: ${left}%; width: ${width}%; background: ${colorMap.namecard}; top: 4px; bottom: 38px; opacity: 0.85;`;
      seg.dataset.scene = s.id;
      seg.title = 'Namecard';
      seg.textContent = 'Namecard';
      seg.onclick = (e) => { e.stopPropagation(); selectScene(s.id); };
      bar.appendChild(seg);
      return;
    }

    const left = (s.start / totalDuration) * 100;
    const width = ((s.end - s.start) / totalDuration) * 100;
    const seg = document.createElement('div');
    seg.className = 'tl-seg' + (activeId === s.id ? ' active' : '');
    seg.style.cssText = `left: ${left}%; width: ${width}%; background: ${colorMap[s.type]};`;
    seg.dataset.scene = s.id;
    seg.title = s.name || sceneNameFor(s);
    seg.textContent = s.name || sceneNameFor(s);
    seg.onclick = (e) => {
      e.stopPropagation();
      selectScene(s.id);
      currentTime = s.start + 0.3;
      if (video.src) { try { video.currentTime = Math.max(0, currentTime - VIDEO_START); } catch (e) {} }
      syncToTime();
      updatePlayhead();
    };
    bar.appendChild(seg);

    if (s.bulletTimings) {
      s.bulletTimings.forEach(t => {
        const m = document.createElement('div');
        m.className = 'tl-bullet';
        m.style.left = ((t / totalDuration) * 100) + '%';
        m.title = 'Bullet @ ' + fmtTime(t);
        bar.appendChild(m);
      });
    }
  });

  // Ruler ticks
  const ruler = $('rulerOverlay');
  ruler.innerHTML = '';
  const step = totalDuration > 180 ? 30 : (totalDuration > 60 ? 10 : 5);
  for (let t = 0; t <= totalDuration; t += step) {
    const left = (t / totalDuration) * 100;
    ruler.insertAdjacentHTML('beforeend',
      `<div class="ruler-tick" style="left:${left}%"></div>
       <div class="ruler-label" style="left:${left}%">${fmtTime(t)}</div>`);
  }
}

function updatePlayhead() {
  $('playhead').style.left = ((currentTime / totalDuration) * 100) + '%';
  $('curTime').textContent = fmtTime(currentTime);
}

// ── Canvas render ───────────────────────────────────────────────────────
function syncToTime() {
  renderCanvas();
  updatePlayhead();
}

function renderCanvas() {
  const t = currentTime;
  const as = activeScene();
  $('canvasInfo').textContent = as ? (as.name || sceneNameFor(as)) + ' · ' + fmtTime(as.start) + ' – ' + fmtTime(as.end) : '';

  // Intro layer
  const introScene = scenes.find(s => s.type === 'intro');
  if (introScene) {
    if (introScene.props.headline) headlineEl.textContent = introScene.props.headline;
    if (introScene.props.name) $('introName').textContent = introScene.props.name;
    if (introScene.props.role) $('introRole').textContent = introScene.props.role;
    if (introScene.props.tag) $('introTag').textContent = introScene.props.tag;
    if (introScene.props.portraitPath) {
      portraitEl.style.backgroundImage = 'url(' + introScene.props.portraitPath + ')';
    }
  }

  if (t < INTRO_END + 0.3) {
    const introOpacity = t < INTRO_END - 0.2 ? 1 : Math.max(0, 1 - (t - (INTRO_END - 0.2)) / 0.5);
    introLayer.style.opacity = introOpacity;
    const hT = Math.min(t / 0.6, 1);
    const hE = 1 - Math.pow(1 - hT, 3);
    headlineEl.style.opacity = hE;
    headlineEl.style.transform = `translateY(${20 * (1 - hE)}px) scale(${0.95 + 0.05 * hE})`;
    const pT = Math.min(Math.max((t - 0.3) / 0.6, 0), 1);
    const pE = 1 - Math.pow(1 - pT, 3);
    portraitEl.style.clipPath = `circle(${pE * 50}% at 50% 50%)`;
    const mT = Math.min(Math.max((t - 0.8) / 0.5, 0), 1);
    introMetaEl.style.opacity = mT;
  } else {
    introLayer.style.opacity = 0;
  }

  // Video layer
  if (t > INTRO_END - 0.3) {
    const vT = Math.min((t - (INTRO_END - 0.3)) / 0.5, 1);
    videoLayer.style.opacity = vT;
  } else {
    videoLayer.style.opacity = 0;
  }

  // Namecard text
  const nc = scenes.find(s => s.type === 'namecard');
  if (nc) {
    $('namecardName').textContent = nc.props.name || 'Speaker';
    $('namecardRole').textContent = nc.props.designation || 'Role';
  }

  // Find any active callout
  const activeContentCallout = scenes.find(s => s.type === 'content' && t >= s.start && t < s.end);
  const activeMeta = scenes.find(s => s.type === 'meta' && t >= s.start && t < s.end);
  const calloutActive = !!(activeContentCallout || activeMeta);

  // Frame transform
  const sx = calloutActive ? geometry.shrunk.w / geometry.full.w : 1;
  const sy = calloutActive ? geometry.shrunk.h / geometry.full.h : 1;
  const tx = calloutActive ? geometry.shrunk.x : geometry.full.x;
  const ty = calloutActive ? geometry.shrunk.y : geometry.full.y;
  frame.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;

  // Namecard visibility
  namecardEl.style.opacity = (t > VIDEO_START + 0.5) ? (calloutActive ? 1 : 0.92) : 0;

  if (activeContentCallout) renderCalloutContent(activeContentCallout, false);
  else if (activeMeta)      renderCalloutContent(activeMeta, true);
  else                       calloutEl.style.display = 'none';
}

function renderCalloutContent(s, isMeta) {
  const t = currentTime;
  const local = t - s.start;
  const dur = s.end - s.start;
  if (local < 0 || local > dur) { calloutEl.style.display = 'none'; return; }

  calloutEl.style.display = 'block';
  calloutEl.style.width = '500px';

  // Opacity-only entrance (no scale pop per your spec)
  let opacity = 1;
  if (local < 0.3) opacity = local / 0.3;
  else if (local > dur - 0.3) opacity = Math.max(0, (dur - local) / 0.3);
  calloutEl.style.opacity = opacity;
  calloutEl.style.transform = 'none';

  if (isMeta) {
    const rows = s.props.items.map((it, i) => {
      const visible = t >= (s.bulletTimings?.[i] || 0);
      return `<div style="display:flex;align-items:center;gap:20px;padding:18px 0;opacity:${visible ? 1 : 0};transform:translateY(${visible ? 0 : 8}px);transition:all 0.45s cubic-bezier(0.16,1,0.3,1);border-top:${i === 0 ? '0' : '1px solid rgba(255,255,255,0.18)'};">
        <div style="width:44px;height:44px;flex-shrink:0;">${ICON_MAP[it.icon] || ICON_MAP.industry}</div>
        <div style="color:#fff;font-size:30px;font-weight:500;">${escapeHtml(it.text)}</div>
      </div>`;
    }).join('');
    calloutEl.innerHTML = `<div style="background:linear-gradient(143deg,#051A2D 0.9%,#0183FF 107.65%);border-radius:20px;padding:40px 48px;box-shadow:0 8px 40px rgba(5,26,45,0.25);">${rows}</div>`;
    return;
  }

  calloutEl.innerHTML = renderContentLayout(s);
}

function renderContentLayout(s) {
  const p = s.props;
  const l = s.layout;
  const navy = 'background:linear-gradient(143deg,#051A2D 0.9%,#0183FF 107.65%);border-radius:20px 20px 0 0;padding:40px 44px;color:#fff;';
  const navyFull = 'background:linear-gradient(143deg,#051A2D 0.9%,#0183FF 107.65%);border-radius:20px;padding:40px 44px;color:#fff;';
  const white = 'background:#fff;border:2px solid #C7E3FF;border-top:0;border-radius:0 0 20px 20px;padding:36px 44px 56px;color:#002B54;overflow:hidden;';
  const whiteFull = 'background:#fff;border:2px solid #C7E3FF;border-radius:20px;padding:44px;color:#002B54;';

  if (l === 'bullets_with_inline_metric') {
    const visibleBullets = (s.bulletTimings || []).map((t, i) => currentTime >= t ? i : -1).filter(x => x >= 0);
    const bulletsHtml = (p.bullets || []).map((b, i) => {
      const visible = visibleBullets.includes(i);
      return `<div style="display:flex;gap:14px;align-items:flex-start;opacity:${visible ? 1 : 0};transform:translateY(${visible ? 0 : 10}px);transition:all 0.4s cubic-bezier(0.16,1,0.3,1);margin-bottom:16px;">
        <span style="color:#0183FF;font-size:28px;font-weight:900;line-height:1.25;flex-shrink:0;">→</span>
        <span style="font-size:26px;font-weight:500;line-height:1.3;color:#002B54;">${escapeHtml(b.text)}</span>
      </div>`;
    }).join('');
    const visibleCount = visibleBullets.length;
    const panelHeight = visibleCount === 0 ? 24 : (56 + visibleCount * 64);
    return `<div style="${navy}"><div style="font-size:36px;font-weight:700;line-height:1.2;">${escapeHtml(p.title || '')}</div></div>
      <div style="${white} max-height:${panelHeight}px;transition:max-height 0.55s cubic-bezier(0.16,1,0.3,1);">${bulletsHtml}</div>`;
  }
  if (l === 'bullets_with_icons') {
    const bulletsHtml = (p.bullets || []).map((b, i) => {
      const visible = currentTime >= (s.bulletTimings?.[i] || 0);
      return `<div style="display:flex;gap:14px;align-items:flex-start;opacity:${visible ? 1 : 0};transition:opacity 0.4s;margin-bottom:14px;">
        <div style="width:48px;height:48px;background:linear-gradient(135deg,#0183FF,#003B73);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ICON_MAP.industry}</div>
        <span style="font-size:22px;font-weight:500;line-height:1.3;color:#002B54;padding-top:4px;">${escapeHtml(b.text)}</span>
      </div>`;
    }).join('');
    return `<div style="${whiteFull}">${bulletsHtml}</div>`;
  }
  if (l === 'simple_metric') {
    return `<div style="${navy}"><div style="font-size:36px;font-weight:700;">${escapeHtml(p.title || '')}</div></div>
      <div style="${white}"><div style="font-size:92px;font-weight:900;color:#002B54;line-height:1;">${escapeHtml(p.metric || '')}</div>
      <div style="font-size:24px;color:#002B54;margin-top:12px;font-weight:500;">${escapeHtml(p.caption || '')}</div></div>`;
  }
  if (l === 'tagpill_metric_before_after') {
    return `<div style="${navy}">
      <div style="display:inline-block;background:#0183FF;padding:8px 16px;border-radius:6px;font-size:20px;font-weight:700;margin-bottom:16px;">${escapeHtml(p.tag || '')}</div>
      <div style="font-size:36px;font-weight:500;line-height:1.15;">${escapeHtml(p.before || '')} → ${escapeHtml(p.after || '')}</div>
    </div>
    <div style="${white}"><div style="font-size:52px;font-weight:900;color:#002B54;line-height:1.1;">${escapeHtml(p.metric || '')}</div>
    <div style="font-size:22px;color:#002B54;margin-top:8px;font-weight:500;">${escapeHtml(p.caption || '')}</div></div>`;
  }
  if (l === 'metric_with_subtext') {
    return `<div style="${whiteFull} border-top:2px solid #C7E3FF;">
      <div style="font-size:88px;font-weight:900;color:#0183FF;line-height:1;">${escapeHtml(p.metric || '')}</div>
      <div style="font-size:36px;font-weight:900;color:#002B54;margin-top:8px;">${escapeHtml(p.label || '')}</div>
      <div style="font-size:22px;color:#002B54;margin-top:8px;">${escapeHtml(p.caption || '')}</div>
    </div>`;
  }
  if (l === 'icon_count') {
    return `<div style="${whiteFull}">
      <div style="width:80px;height:80px;background:linear-gradient(135deg,#0183FF,#003B73);border-radius:16px;padding:18px;margin-bottom:18px;">${ICON_MAP.people}</div>
      <div style="font-size:74px;font-weight:900;color:#002B54;line-height:1;">${escapeHtml(p.count || '')}</div>
      <div style="font-size:24px;color:#002B54;margin-top:8px;font-weight:500;">${escapeHtml(p.label || '')}</div>
    </div>`;
  }
  if (l === 'time_comparison') {
    return `<div style="${navy}"><div style="font-size:36px;font-weight:700;">${escapeHtml(p.title || '')}</div></div>
    <div style="${white}"><div style="display:flex;align-items:center;gap:20px;justify-content:center;">
      <div style="text-align:center;"><div style="font-size:64px;font-weight:900;color:#002B54;line-height:1;">${escapeHtml(p.beforeValue || '')}</div>
      <div style="font-size:20px;color:#6b7280;margin-top:4px;">${escapeHtml(p.beforeUnit || '')}</div></div>
      <div style="font-size:36px;color:#0183FF;font-weight:900;">»</div>
      <div style="text-align:center;"><div style="font-size:64px;font-weight:900;color:#0183FF;line-height:1;">${escapeHtml(p.afterValue || '')}</div>
      <div style="font-size:20px;color:#002B54;margin-top:4px;font-weight:600;">${escapeHtml(p.afterUnit || '')}</div></div>
    </div></div>`;
  }
  if (l === 'title_only_dark') {
    return `<div style="${navyFull}"><div style="font-size:38px;font-weight:700;line-height:1.2;">${escapeHtml(p.title || 'Title')}</div></div>`;
  }
  if (l === 'country_bullets') {
    const visibleBullets = (s.bulletTimings || []).map((t, i) => currentTime >= t ? i : -1).filter(x => x >= 0);
    const bulletsHtml = (p.bullets || []).map((b, i) => {
      const visible = visibleBullets.includes(i);
      return `<div style="display:flex;gap:14px;align-items:flex-start;opacity:${visible ? 1 : 0};transition:opacity 0.4s;margin-bottom:14px;">
        <span style="color:#0183FF;font-size:24px;font-weight:900;">→</span>
        <span style="font-size:22px;font-weight:500;color:#002B54;">${escapeHtml(b.text)}</span>
      </div>`;
    }).join('');
    return `<div style="${navy}"><div style="font-size:32px;font-weight:700;">🌐 ${escapeHtml(p.country || '')}</div></div>
    <div style="${white}">${bulletsHtml}</div>`;
  }
  if (l === 'dual_section_bullets') {
    const sA = (p.sectionA || []).map(b => `<div style="display:flex;gap:8px;font-size:20px;color:#002B54;margin-bottom:6px;"><span style="color:#0183FF;">·</span>${escapeHtml(b)}</div>`).join('');
    const sB = (p.sectionB || []).map(b => `<div style="display:flex;gap:8px;font-size:20px;color:#002B54;margin-bottom:6px;"><span style="color:#0183FF;">·</span>${escapeHtml(b)}</div>`).join('');
    return `<div style="${navy}"><div style="font-size:30px;font-weight:700;line-height:1.2;">${escapeHtml(p.title || '')}</div></div>
    <div style="${white}">
      <div style="margin-bottom:18px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="color:#0183FF;font-size:22px;font-weight:900;">→</span><div style="font-size:22px;font-weight:700;color:#002B54;">${escapeHtml(p.sectionAName || 'Section A')}</div></div>${sA}</div>
      <div><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="color:#0183FF;font-size:22px;font-weight:900;">→</span><div style="font-size:22px;font-weight:700;color:#002B54;">${escapeHtml(p.sectionBName || 'Section B')}</div></div>${sB}</div>
    </div>`;
  }
  return `<div style="${whiteFull}"><div style="color:#6b7280;">Unsupported layout: ${l}</div></div>`;
}

// ── Toolbar actions ─────────────────────────────────────────────────────
$('btnPlay').onclick = () => {
  if (currentTime >= totalDuration) { currentTime = 0; if (video.src) video.currentTime = 0; }
  isPlaying = true;
  lastTick = 0;
  if (video.src) {
    if (currentTime >= VIDEO_START) {
      video.currentTime = currentTime - VIDEO_START;
      video.play().catch(() => {});
    } else {
      setTimeout(() => { if (currentTime >= VIDEO_START && isPlaying) video.play().catch(() => {}); }, (VIDEO_START - currentTime) * 1000);
    }
  }
  $('statusText').textContent = 'Playing';
  requestAnimationFrame(tick);
};
$('btnPause').onclick = () => {
  isPlaying = false;
  if (video.src) video.pause();
  $('statusText').textContent = 'Paused';
};
$('btnReset').onclick = () => {
  isPlaying = false;
  if (video.src) { video.pause(); video.currentTime = 0; }
  currentTime = 0;
  $('statusText').textContent = 'Reset';
  syncToTime();
};
$('btnDuplicate').onclick = () => {
  const s = activeScene();
  if (!s || (s.type !== 'content' && s.type !== 'meta')) {
    toast('Select a callout to duplicate', 'error'); return;
  }
  const idx = scenes.indexOf(s);
  const copy = JSON.parse(JSON.stringify(s));
  copy.id = 's' + Date.now();
  copy.name = (s.name || sceneNameFor(s)) + ' (copy)';
  const offset = (s.end - s.start) + 2;
  copy.start = s.start + offset;
  copy.end = s.end + offset;
  if (copy.bulletTimings) copy.bulletTimings = copy.bulletTimings.map(t => t + offset);
  scenes.splice(idx + 1, 0, copy);
  activeId = copy.id;
  renderScenes(); renderTimeline(); renderInspector(); renderCanvas();
  persist();
  toast('Scene duplicated', 'success');
};
$('btnDelete').onclick = () => {
  const s = activeScene();
  if (!s) return;
  if (s.type === 'intro' || s.type === 'namecard') {
    toast(`Can't delete the ${s.type}`, 'error'); return;
  }
  if (!confirm(`Delete "${s.name || sceneNameFor(s)}"?`)) return;
  const idx = scenes.indexOf(s);
  scenes.splice(idx, 1);
  activeId = scenes[Math.max(0, idx - 1)]?.id;
  renderScenes(); renderTimeline(); renderInspector(); renderCanvas();
  persist();
};
$('btnApprove').onclick = async () => {
  const btn = $('btnApprove');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    const cleanScenes = scenes
      .filter(s => s.type !== 'intro' && s.type !== 'namecard')
      .map(({ _savedProps, ...rest }) => rest);
    await API.updateProject(projectId, {
      ...job,
      scenes: cleanScenes,
      introScene: scenes.find(s => s.type === 'intro')?.props,
      namecard: scenes.find(s => s.type === 'namecard')?.props,
      frameSettings: geometry,
      totalDuration
    });
    btn.textContent = 'Starting render...';
    await API.triggerRender(projectId);
    toast('Render started — you can watch progress on the project list.', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 800);
  } catch (e) {
    toast('Approve failed: ' + e.message, 'error');
    btn.disabled = false; btn.textContent = 'Approve and render';
  }
};

// Add buttons in left rail
document.querySelectorAll('[data-add]').forEach(btn => {
  btn.onclick = () => {
    const t = btn.dataset.add;
    if (t === 'intro') {
      if (scenes.find(s => s.type === 'intro')) { toast('Intro already exists', 'error'); return; }
      scenes.unshift({ id: 'intro', type: 'intro', name: 'Intro', start: 0, end: 5, props: { headline: '', name: '', role: '', tag: '' } });
    } else if (t === 'namecard') {
      if (scenes.find(s => s.type === 'namecard')) { toast('Namecard already exists', 'error'); return; }
      scenes.splice(1, 0, { id: 'namecard', type: 'namecard', name: 'Namecard', start: VIDEO_START, end: totalDuration, props: { name: '', designation: '' } });
    } else if (t === 'content') {
      const lastEnd = scenes.reduce((m, s) => Math.max(m, s.end), VIDEO_START);
      const newStart = Math.min(lastEnd + 2, totalDuration - 10);
      const newEnd = Math.min(newStart + 15, totalDuration);
      const newScene = {
        id: 'c' + Date.now(),
        type: 'content',
        name: 'New callout',
        start: newStart,
        end: newEnd,
        layout: 'bullets_with_inline_metric',
        props: { title: 'New callout', bullets: [{ text: 'Bullet 1' }, { text: 'Bullet 2' }] },
        bulletTimings: [newStart + 3, newStart + 7],
        _savedProps: {}
      };
      scenes.push(newScene);
      activeId = newScene.id;
    }
    renderScenes(); renderTimeline(); renderInspector(); renderCanvas();
    persist();
  };
});

// Zoom slider
$('zoomSlider').oninput = (e) => {
  zoom = parseFloat(e.target.value);
  $('zoomLabel').textContent = zoom.toFixed(1) + '×';
  renderTimeline();
};

// Timeline scrub
$('timelineBar').onclick = (e) => {
  if (e.target.classList.contains('tl-seg')) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  currentTime = Math.max(0, Math.min(1, ratio)) * totalDuration;
  if (video.src && currentTime >= VIDEO_START) {
    try { video.currentTime = currentTime - VIDEO_START; } catch (e) {}
  }
  syncToTime();
};

// Frame settings modal
$('btnFrameSettings').onclick = () => {
  ['fullX', 'fullY', 'fullW', 'fullH'].forEach(k => $(k).value = geometry.full[k.substring(4).toLowerCase()]);
  ['shrunkX', 'shrunkY', 'shrunkW', 'shrunkH'].forEach(k => $(k).value = geometry.shrunk[k.substring(6).toLowerCase()]);
  updateRatioInfo();
  $('frameSettingsModal').style.display = 'flex';
};
$('modalClose').onclick = () => { $('frameSettingsModal').style.display = 'none'; };
$('btnResetGeometry').onclick = () => {
  geometry.full = { x: 90, y: 61, w: 1766, h: 967 };
  geometry.shrunk = { x: 617, y: 112, w: 1241, h: 856 };
  $('fullX').value = 90; $('fullY').value = 61; $('fullW').value = 1766; $('fullH').value = 967;
  $('shrunkX').value = 617; $('shrunkY').value = 112; $('shrunkW').value = 1241; $('shrunkH').value = 856;
  updateRatioInfo();
  renderCanvas();
};
$('btnApplyFrame').onclick = () => {
  geometry.full = { x: +$('fullX').value, y: +$('fullY').value, w: +$('fullW').value, h: +$('fullH').value };
  geometry.shrunk = { x: +$('shrunkX').value, y: +$('shrunkY').value, w: +$('shrunkW').value, h: +$('shrunkH').value };
  $('frameSettingsModal').style.display = 'none';
  renderCanvas();
  persist();
};
function updateRatioInfo() {
  const sx = (+$('shrunkW').value / +$('fullW').value).toFixed(3);
  const sy = (+$('shrunkH').value / +$('fullH').value).toFixed(3);
  $('ratioInfo').textContent = sx + ' W × ' + sy + ' H';
}
['fullX','fullY','fullW','fullH','shrunkX','shrunkY','shrunkW','shrunkH'].forEach(id => {
  $(id).oninput = updateRatioInfo;
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === ' ') {
    e.preventDefault();
    if (isPlaying) $('btnPause').click(); else $('btnPlay').click();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    $('btnDelete').click();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault();
    $('btnDuplicate').click();
  }
});

// ── Animation tick ──────────────────────────────────────────────────────
function tick(ts) {
  if (!isPlaying) return;
  if (!lastTick) lastTick = ts;
  const dt = (ts - lastTick) / 1000;
  lastTick = ts;
  // If a video is present, currentTime is driven by video.timeupdate. Otherwise advance manually.
  if (!video.src) {
    currentTime += dt;
    if (currentTime >= totalDuration) {
      currentTime = totalDuration;
      isPlaying = false;
      $('statusText').textContent = 'Ended';
    }
    syncToTime();
  }
  // Auto-select scene as we cross boundaries
  const cs = scenes.find(s => currentTime >= s.start && currentTime < s.end && s.type !== 'namecard');
  if (cs && cs.id !== activeId) {
    activeId = cs.id;
    renderScenes();
    renderInspector();
  }
  if (isPlaying) requestAnimationFrame(tick);
}

// ── Utilities ───────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// ── Initial render ──────────────────────────────────────────────────────
function renderAll() {
  renderScenes();
  renderTimeline();
  renderInspector();
  renderCanvas();
  updatePlayhead();
}

$('projectLabel').textContent = (job.speaker?.name || projectId);
$('liveJobId').textContent = projectId;
const footerClientEl = $('footerClient');
if (footerClientEl && job.introHeadline) footerClientEl.textContent = '—';

window.addEventListener('resize', () => { fitStage(); renderCanvas(); });
fitStage();
renderAll();

})();
