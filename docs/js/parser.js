// Testimonial callout DOCX parser - browser module
// Depends on: mammoth.browser.min.js (loaded via CDN in upload.html)
// Exposes: window.parseCalloutsDocx(arrayBuffer) → Promise<parsed>
//
// Accepted document shape (all markers case-insensitive):
//
//   Title callout: <intro headline>        ← optional, becomes the intro headline
//   HC: 9.5K+                              ← optional intro meta (also Industry:, Geo:)
//   Industry: F&B, Retail
//   Geo: Indonesia
//
//   Name plate for main video:             ← also accepts [SPEAKER]
//   Gemini Aryanto
//   Group CHRO
//
//   [CALLOUT 1] 0:04-0:12                  ← also accepts [SLIDE n], [SCENE n], [CARD n]
//   AI-Enabled HCM at Scale                ← first line = title
//   9.5K+ employees                        ← every line after = a bullet
//   Blended workforce
//   5+ markets
//
// Bullets may be real Word list items, or plain paragraphs, or paragraphs
// prefixed with - • * > → ◦ ▪. Production notes wrapped in <angle brackets>
// are stripped out.

(function (global) {
  'use strict';

  // ───────────────────────────── patterns ─────────────────────────────

  // [CALLOUT 1] 0:04-0:12  /  [SLIDE 2] 0:13 – 0:17  /  CALLOUT 3 0:19-0:25
  // Brackets optional, but when absent a time range is required so that an
  // ordinary sentence mentioning "callout 2" is not mistaken for a marker.
  const MARKER_RE = /^\s*(\[|\()?\s*(?:SLIDE|CALLOUT|SCENE|CARD)\s*#?\s*(\d+)\s*(\]|\))?\s*[:.\-–—]?\s*(.*)$/i;

  // Title callout: ...  /  Title: ...  /  Headline: ...
  const TITLE_RE = /^\s*(?:title\s*(?:callout|card|slide)?|headline|intro\s*(?:title|headline)?)\s*[:\-–]\s*(.+)$/i;

  // Name plate for main video:  /  Namecard:  /  [SPEAKER]  /  Speaker:
  const SPEAKER_RE = /^\s*(?:\[\s*speaker\s*\]|name\s*plate[^:]*|name\s*card[^:]*|namecard[^:]*|speaker)\s*:?\s*(.*)$/i;

  // [SECTION TITLE SLIDE]
  const SECTION_RE = /^\s*\[\s*section\s*title[^\]]*\]\s*(.*)$/i;

  // [industry] F&B   /   [HC] 9.5K+
  const META_BRACKET_RE = /^\s*\[(industry|hc|headcount|employees|locn|location|geo|geography|sector|vertical)\]\s*(.*)$/i;

  // Industry: F&B   /   HC: 9.5K+   /   Geo: Indonesia
  const META_COLON_RE = /^\s*(industry|hc|headcount|employees|locn|location|geo|geography|sector|vertical)\s*[:\-–]\s*(.+)$/i;

  // Leading bullet glyphs the author may have typed by hand.
  const BULLET_PREFIX_RE = /^[\-–—•\*→◦▪‣>»]+\s*/;

  const META_ICON_MAP = {
    industry: 'industry',
    sector: 'industry',
    vertical: 'industry',
    hc: 'people',
    headcount: 'people',
    employees: 'people',
    locn: 'location',
    location: 'location',
    geo: 'location',
    geography: 'location',
  };

  // ───────────────────────────── helpers ──────────────────────────────

  function parseTime(s) {
    if (!s) return null;
    const cleaned = String(s).trim().replace(/[;.]/g, ':');
    const m = cleaned.match(/^(\d+):(\d+)$/);
    if (!m) {
      const asNum = parseInt(cleaned, 10);
      return isNaN(asNum) ? null : asNum;
    }
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function extractTimeRange(text) {
    if (!text) return null;
    const re = /(\d+[:;.]?\d+)\s*(?:[-–—]|to)\s*(\d+[:;.]?\d*)/i;
    const m = text.match(re);
    if (!m) return null;
    const startSec = parseTime(m[1]);
    let endRaw = m[2];
    // "0:45 - 58" → treat 58 as seconds inside the same minute
    if (!/[:;]/.test(endRaw) && startSec !== null) {
      const startMin = Math.floor(startSec / 60);
      endRaw = startMin + ':' + String(endRaw).padStart(2, '0');
    }
    const endSec = parseTime(endRaw);
    if (startSec === null || endSec === null) return null;
    return { start: startSec, end: endSec };
  }

  // Remove <production notes> but leave a lone ">" bullet glyph alone.
  // Internal whitespace is preserved: tabs and double spaces are how a bullet
  // pins its own timestamp (see splitBulletTime).
  function stripNotes(text) {
    return String(text == null ? '' : text).replace(/<[^<>]*>/g, ' ').trim();
  }

  // Tidy whitespace for text that will be displayed rather than time-split.
  function squash(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  }

  function extractMetaItem(text) {
    let m = text.match(META_BRACKET_RE);
    if (m) {
      const value = (m[2] || '').trim();
      if (!value) return null;
      return { icon: META_ICON_MAP[m[1].toLowerCase()] || 'industry', text: value };
    }
    m = text.match(META_COLON_RE);
    if (m) {
      return { icon: META_ICON_MAP[m[1].toLowerCase()] || 'industry', text: m[2].trim() };
    }
    return null;
  }

  // "Manual payroll<TAB>0:12" → pin this bullet to 0:12
  function splitBulletTime(text) {
    const m = text.match(/^(.*?)\s*\t+\s*(\d+[:;]\d+)\s*$/);
    if (m) return { text: m[1].trim(), time: parseTime(m[2]) };
    const m2 = text.match(/^(.*?)\s{2,}(\d+[:;]\d+)\s*$/);
    if (m2) return { text: m2[1].trim(), time: parseTime(m2[2]) };
    return { text: text.trim(), time: null };
  }

  function expandParagraph(pEl) {
    // Split a <p> on <br> into logical lines
    const segs = pEl.innerHTML.split(/<br\s*\/?>/i);
    return segs.map(s => {
      const tmp = document.createElement('div');
      tmp.innerHTML = s;
      return (tmp.textContent || '').replace(/ /g, ' ').trim();
    }).filter(Boolean);
  }

  function inferLayout(block) {
    const title = block.title || '';
    const bullets = block.bullets || [];
    const meta = block.meta || [];

    if (meta.length > 0) return 'meta_intro';
    if (bullets.length === 0) return 'title_only_dark';

    const allText = title + ' ' + bullets.map(b => b.text).join(' ');
    const timeCompareRe = /(\d+)\s*(months?|minutes?|hours?|days?|weeks?|years?)\s*(>>|→|->|to)\s*(\d+)\s*(months?|minutes?|hours?|days?|weeks?|years?)/i;
    if (timeCompareRe.test(allText)) return 'time_comparison';

    return 'bullets_with_inline_metric';
  }

  function distributeBulletTimings(block) {
    if (!block.bullets || block.bullets.length === 0) return [];
    const allHaveTime = block.bullets.every(b => b.time !== null && b.time !== undefined);
    if (allHaveTime) return block.bullets.map(b => b.time);

    const dur = Math.max(0, (block.end || 0) - (block.start || 0));
    const n = block.bullets.length;
    const padStart = Math.min(2, dur * 0.1);
    const padEnd = Math.min(3, dur * 0.15);
    const usable = Math.max(0, dur - padStart - padEnd);
    const step = n === 1 ? 0 : usable / (n - 1);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(Math.round((block.start + padStart + i * step) * 10) / 10);
    }
    return out;
  }

  function finalizeBlock(block) {
    block.title = (block.titleLines || []).filter(Boolean).join(' ').trim();
    delete block.titleLines;

    const isMeta = block.meta.length > 0;
    const type = isMeta ? 'meta' : 'content';
    const layout = inferLayout(block);
    const bulletTimings = distributeBulletTimings(block);

    let props;
    if (layout === 'meta_intro') {
      props = { items: block.meta };
    } else if (layout === 'title_only_dark') {
      props = { title: block.title };
    } else {
      props = { title: block.title, bullets: block.bullets.map(b => ({ text: b.text })) };
    }

    const itemTimings = isMeta
      ? distributeBulletTimings({
          bullets: block.meta.map(() => ({ time: null })),
          start: block.start, end: block.end,
        })
      : null;

    return {
      type, layout,
      start: block.start, end: block.end,
      props,
      bulletTimings: isMeta ? itemTimings : bulletTimings,
    };
  }

  // ───────────────────────────── main ─────────────────────────────────

  async function parseCalloutsDocx(arrayBuffer) {
    if (!global.mammoth) throw new Error('mammoth.js not loaded');

    const { value: html } = await global.mammoth.convertToHtml({ arrayBuffer });

    const wrap = document.createElement('div');
    wrap.innerHTML = html;

    const result = {
      speaker: { name: null, designation: null },
      introHeadline: null,
      introMeta: [],     // HC / Industry / Geo found before the first callout
      scenes: [],
    };

    // ── flatten the document into a list of lines and list-blocks ──────
    const tokens = [];
    (function walk(node) {
      for (const el of Array.from(node.children)) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'p' || /^h[1-6]$/.test(tag)) {
          expandParagraph(el).forEach(line => tokens.push({ kind: 'line', text: line }));
        } else if (tag === 'ul' || tag === 'ol') {
          const items = [];
          for (const li of Array.from(el.children)) {
            const t = (li.textContent || '').replace(/ /g, ' ').trim();
            if (t) items.push(t);
          }
          if (items.length) tokens.push({ kind: 'list', items });
        } else if (tag === 'table') {
          // Word tables: read each cell as its own line, top-to-bottom.
          for (const cell of Array.from(el.querySelectorAll('td, th'))) {
            const t = (cell.textContent || '').replace(/ /g, ' ').trim();
            if (t) tokens.push({ kind: 'line', text: t });
          }
        } else {
          walk(el);
        }
      }
    })(wrap);

    // ── state machine ──────────────────────────────────────────────────
    let mode = 'preamble';
    const speakerLines = [];
    const sectionTitleLines = [];
    let current = null;

    const flush = () => { if (current) result.scenes.push(finalizeBlock(current)); current = null; };

    const addBulletOrMeta = (rawText) => {
      const text = stripNotes(rawText);
      if (!text) return;
      const meta = extractMetaItem(text);
      if (meta) { current.meta.push(meta); return; }
      current.bullets.push(splitBulletTime(text.replace(BULLET_PREFIX_RE, '')));
    };

    for (const tk of tokens) {
      // ── real Word list items ────────────────────────────────────────
      if (tk.kind === 'list') {
        if (current) {
          tk.items.forEach(addBulletOrMeta);
        } else {
          // A list before the first callout: treat as intro meta if tagged.
          tk.items.forEach(it => {
            const meta = extractMetaItem(stripNotes(it));
            if (meta) result.introMeta.push(meta);
          });
        }
        continue;
      }

      const rawLine = tk.text;
      if (!rawLine) continue;

      // ── callout / slide marker ──────────────────────────────────────
      const mk = rawLine.match(MARKER_RE);
      if (mk) {
        const hadBracket = !!(mk[1] || mk[3]);
        const rest = mk[4] || '';
        const range = extractTimeRange(rest);
        if (hadBracket || range) {
          flush();
          current = {
            start: range ? range.start : 0,
            end: range ? range.end : 0,
            titleLines: [],
            bullets: [],
            meta: [],
          };
          mode = 'slide';
          continue;
        }
      }

      // ── explicit section switches ───────────────────────────────────
      const sp = rawLine.match(SPEAKER_RE);
      if (sp) {
        flush();
        mode = 'speaker';
        const inline = stripNotes(sp[1] || '');
        if (inline) speakerLines.push(inline);
        continue;
      }

      const sec = rawLine.match(SECTION_RE);
      if (sec) {
        flush();
        mode = 'section';
        const inline = stripNotes(sec[1] || '');
        if (inline) sectionTitleLines.push(inline);
        continue;
      }

      // ── intro headline, anywhere before the first callout ───────────
      if (!current) {
        const ttl = rawLine.match(TITLE_RE);
        if (ttl) {
          const v = stripNotes(ttl[1]);
          if (v) { result.introHeadline = v; mode = 'preamble'; continue; }
        }
      }

      const line = stripNotes(rawLine);
      if (!line) continue;

      // ── inside a callout ────────────────────────────────────────────
      if (mode === 'slide' && current) {
        const meta = extractMetaItem(line);
        if (meta) { current.meta.push(meta); continue; }

        const hadBulletGlyph = BULLET_PREFIX_RE.test(line);
        const body = line.replace(BULLET_PREFIX_RE, '').trim();
        if (!body) continue;

        // First plain line becomes the title; everything after is a bullet.
        if (current.titleLines.length === 0 && current.bullets.length === 0 && !hadBulletGlyph) {
          current.titleLines.push(squash(body));
        } else {
          current.bullets.push(splitBulletTime(body));
        }
        continue;
      }

      // ── speaker block ───────────────────────────────────────────────
      if (mode === 'speaker') {
        if (speakerLines.length < 2) speakerLines.push(line);
        continue;
      }

      // ── section title block ─────────────────────────────────────────
      if (mode === 'section') {
        sectionTitleLines.push(line);
        continue;
      }

      // ── preamble: pick up intro meta, ignore everything else ────────
      if (mode === 'preamble') {
        const meta = extractMetaItem(line);
        if (meta) result.introMeta.push(meta);
      }
    }
    flush();

    if (speakerLines.length >= 1) result.speaker.name = speakerLines[0];
    if (speakerLines.length >= 2) result.speaker.designation = speakerLines[1];
    if (sectionTitleLines.length > 0) result.introHeadline = result.introHeadline || sectionTitleLines.join(' ');

    return result;
  }

  global.parseCalloutsDocx = parseCalloutsDocx;
})(window);
