// Testimonial callout DOCX parser - browser module
// Depends on: mammoth.browser.min.js (loaded via CDN in upload.html)
// Exposes: window.parseCalloutsDocx(arrayBuffer) → Promise<parsed>

(function (global) {
  'use strict';

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
    const re = /(\d+[:;.]?\d+)\s*[-–—]\s*(\d+[:;.]?\d*)/;
    const m = text.match(re);
    if (!m) return null;
    const startSec = parseTime(m[1]);
    let endRaw = m[2];
    if (!/[:;]/.test(endRaw) && startSec !== null) {
      const startMin = Math.floor(startSec / 60);
      endRaw = startMin + ':' + endRaw.padStart(2, '0');
    }
    const endSec = parseTime(endRaw);
    if (startSec === null || endSec === null) return null;
    return { start: startSec, end: endSec };
  }

  function extractMetaItem(text) {
    const m = text.match(/^\s*\[(industry|HC|locn|location)\]\s*(.*)$/i);
    if (!m) return null;
    const iconMap = { industry: 'industry', hc: 'people', locn: 'location', location: 'location' };
    return { icon: iconMap[m[1].toLowerCase()], text: m[2].trim() };
  }

  function splitBulletTime(text) {
    const re = /^(.*?)\s*[\t]+\s*(\d+[:;]\d+)\s*$/;
    const m = text.match(re);
    if (m) return { text: m[1].trim(), time: parseTime(m[2]) };
    const re2 = /^(.*?)\s{2,}(\d+[:;]\d+)\s*$/;
    const m2 = text.match(re2);
    if (m2) return { text: m2[1].trim(), time: parseTime(m2[2]) };
    return { text: text.trim(), time: null };
  }

  function expandParagraph(pEl) {
    // Split a <p> on <br> into logical lines
    const html = pEl.innerHTML;
    const segs = html.split(/<br\s*\/?>/i);
    return segs.map(s => {
      const tmp = document.createElement('div');
      tmp.innerHTML = s;
      return (tmp.textContent || '').trim();
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

    const hasInlineMetric = bullets.some(b =>
      /(\d+%|\d+x|→|->|>>|hours\/weeks|hours→|min→)/i.test(b.text)
    );
    if (hasInlineMetric) return 'bullets_with_inline_metric';

    return 'bullets_with_inline_metric';
  }

  function distributeBulletTimings(block) {
    if (!block.bullets || block.bullets.length === 0) return [];
    const allHaveTime = block.bullets.every(b => b.time !== null && b.time !== undefined);
    if (allHaveTime) return block.bullets.map(b => b.time);

    const dur = block.end - block.start;
    const n = block.bullets.length;
    const padStart = Math.min(2, dur * 0.1);
    const padEnd = Math.min(3, dur * 0.15);
    const usable = dur - padStart - padEnd;
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
          start: block.start, end: block.end
        })
      : null;

    return {
      type, layout,
      start: block.start, end: block.end,
      props,
      bulletTimings: isMeta ? itemTimings : bulletTimings
    };
  }

  async function parseCalloutsDocx(arrayBuffer) {
    // mammoth.browser.min.js exposes window.mammoth
    if (!global.mammoth) throw new Error('mammoth.js not loaded');

    const { value: html } = await global.mammoth.convertToHtml({ arrayBuffer });

    const wrap = document.createElement('div');
    wrap.innerHTML = html;

    const result = {
      speaker: { name: null, designation: null },
      introHeadline: null,
      scenes: []
    };

    const slideStartRe = /^\s*\[SLIDE\s+\d+\s*\]\s*(.+?)(?:\s*\(.*\))?\s*$/i;

    const tokens = [];
    for (const el of Array.from(wrap.children)) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'p') {
        const lines = expandParagraph(el);
        lines.forEach(line => tokens.push({ kind: 'line', text: line }));
      } else if (tag === 'ul' || tag === 'ol') {
        const items = [];
        for (const li of Array.from(el.children)) {
          const t = (li.textContent || '').trim();
          if (t) items.push(t);
        }
        tokens.push({ kind: 'list', items });
      }
    }

    let mode = 'preamble';
    const speakerLines = [];
    const sectionTitleLines = [];
    let current = null;

    const flush = () => { if (current) result.scenes.push(finalizeBlock(current)); current = null; };

    for (const tk of tokens) {
      if (tk.kind === 'list') {
        if (current) {
          for (const itemText of tk.items) {
            const meta = extractMetaItem(itemText);
            if (meta) current.meta.push(meta);
            else current.bullets.push(splitBulletTime(itemText));
          }
        }
        continue;
      }

      const line = tk.text;
      if (!line) continue;

      const m = line.match(slideStartRe);
      if (m) {
        flush();
        const range = extractTimeRange(m[1]);
        current = {
          start: range ? range.start : 0,
          end:   range ? range.end   : 0,
          titleLines: [],
          bullets: [],
          meta: []
        };
        mode = 'slide';
        continue;
      }

      if (/^\[SPEAKER\]/i.test(line)) { mode = 'speaker'; continue; }
      if (/^\[SECTION TITLE SLIDE/i.test(line)) { mode = 'section'; continue; }

      if (mode === 'speaker' && !line.startsWith('[')) {
        speakerLines.push(line);
      } else if (mode === 'section' && !line.startsWith('[')) {
        sectionTitleLines.push(line);
      } else if (mode === 'slide' && current) {
        // Detect bullet-prefixed lines: -, •, *, →, ◦, ▪ (common docx bullet chars)
        // These come from docx files where the user used manual bullet characters
        // instead of Word's list formatting (mammoth only emits <ul> for proper lists).
        const bulletMatch = line.match(/^[\-\u2022\*\u2192\u25E6\u25AA\u2023]\s+(.+)$/);
        if (bulletMatch) {
          const bulletText = bulletMatch[1].trim();
          // Also check for [meta] markers in bullet form (industry/hc/locn)
          const meta = extractMetaItem(bulletText);
          if (meta) {
            current.meta.push(meta);
          } else {
            current.bullets.push(splitBulletTime(bulletText));
          }
        } else {
          current.titleLines.push(line);
        }
      }
    }
    flush();

    if (speakerLines.length >= 1) result.speaker.name = speakerLines[0];
    if (speakerLines.length >= 2) result.speaker.designation = speakerLines[1];
    if (sectionTitleLines.length > 0) result.introHeadline = sectionTitleLines.join(' ');

    return result;
  }

  global.parseCalloutsDocx = parseCalloutsDocx;
})(window);
