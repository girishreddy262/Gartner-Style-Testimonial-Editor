// =============================================================================
// Darwin Reel — script parser
// =============================================================================
// Input: plain text extracted from the script DOCX (one logical line per line).
// Output: a structured timeline the editor + renderer consume.
//
// Grammar:
//   [MM:SS]              → a timestamp marker (seconds into the Darwin video)
//   /split start         → enter split layout at the most recent timestamp
//   /split end           → return to full Darwin at the most recent timestamp
//   any other text       → spoken narration (becomes a caption), attached to the
//                          most recent timestamp
//
// Rules:
//   - A /split start with no matching /split end stays split until the next
//     /split start or the end of the video.
//   - Stock clips are assigned to split blocks IN ORDER (block 0 → stock[0], …).
//   - Markdown bold/italic wrappers (**, *) from DOCX extraction are stripped.
//   - Timestamp + directive can share a line ("[00:08]  /split start").
// =============================================================================

function parseDarwinScript(rawText, opts = {}) {
  const totalDuration = opts.totalDuration || null; // seconds of the Darwin video, if known

  // Strip markdown emphasis wrappers the DOCX extractor adds.
  const clean = (s) => s
    .replace(/\*\*/g, '')
    .replace(/(^|\s)\*(\S)/g, '$1$2')
    .replace(/(\S)\*(\s|$)/g, '$1$2')
    .replace(/^#+\s*/, '')
    .trim();

  let lines = rawText.split(/\r?\n/).map(clean).filter(l => l.length > 0);

  const TS_RE = /\[(\d{1,2}):(\d{2})\]/;          // [MM:SS]
  const SPLIT_START_RE = /\/split\s+start\b/i;
  const SPLIT_END_RE = /\/split\s+end\b/i;

  const tsToSeconds = (m) => parseInt(m[1], 10) * 60 + parseInt(m[2], 10);

  // The script body begins at the FIRST line containing a [MM:SS] timestamp.
  // Anything above it (title, instructions, format notes) is preamble and is
  // ignored — prevents help text mentioning "/split" or "[MM:SS]" from being
  // mis-parsed as real directives/captions.
  const firstTsLine = lines.findIndex(l => TS_RE.test(l));
  if (firstTsLine > 0) lines = lines.slice(firstTsLine);

  // First pass: build an ordered list of events with their timestamps.
  const events = []; // { time, type: 'split-start'|'split-end'|'caption', text? }
  let lastTime = 0;
  let sawAnyTimestamp = false;

  for (const line of lines) {
    const tsMatch = line.match(TS_RE);
    let time = lastTime;
    if (tsMatch) { time = tsToSeconds(tsMatch); lastTime = time; sawAnyTimestamp = true; }

    const hasStart = SPLIT_START_RE.test(line);
    const hasEnd = SPLIT_END_RE.test(line);

    if (hasStart) events.push({ time, type: 'split-start' });
    if (hasEnd) events.push({ time, type: 'split-end' });

    // Caption = the line with timestamp + directives stripped out
    const caption = line
      .replace(TS_RE, '')
      .replace(/\/split\s+start\b/ig, '')
      .replace(/\/split\s+end\b/ig, '')
      .trim();
    if (caption.length > 0) {
      events.push({ time, type: 'caption', text: caption });
    }
  }

  // Second pass: derive split BLOCKS (start→end ranges) and CAPTIONS.
  const splitBlocks = []; // { start, end, stockIndex }
  let openStart = null;
  for (const ev of events) {
    if (ev.type === 'split-start') {
      // An unclosed previous split implicitly ends here.
      if (openStart != null) {
        splitBlocks.push({ start: openStart, end: ev.time, stockIndex: splitBlocks.length });
      }
      openStart = ev.time;
    } else if (ev.type === 'split-end') {
      if (openStart != null) {
        splitBlocks.push({ start: openStart, end: ev.time, stockIndex: splitBlocks.length });
        openStart = null;
      }
    }
  }
  // Unclosed final split → runs to end of video (or last known time).
  if (openStart != null) {
    const endTime = totalDuration || lastTime;
    splitBlocks.push({ start: openStart, end: endTime, stockIndex: splitBlocks.length });
  }

  // Captions with start/end times (each caption shows until the next caption).
  const captionEvents = events.filter(e => e.type === 'caption');
  const captions = captionEvents.map((c, i) => {
    const next = captionEvents[i + 1];
    return {
      text: c.text,
      start: c.time,
      end: next ? next.time : (totalDuration || c.time + 4),
    };
  });

  return {
    splitBlocks,        // [{ start, end, stockIndex }]
    captions,           // [{ text, start, end }]
    timestamps: [...new Set(events.map(e => e.time))].sort((a, b) => a - b),
    sawAnyTimestamp,
    stockClipsNeeded: splitBlocks.length,
    warnings: buildWarnings(splitBlocks, sawAnyTimestamp),
  };
}

function buildWarnings(splitBlocks, sawAnyTimestamp) {
  const w = [];
  if (!sawAnyTimestamp) w.push('No [MM:SS] timestamps found — the whole video will play as full-frame Darwin with no splits.');
  for (const b of splitBlocks) {
    if (b.end <= b.start) w.push(`A /split block at ${b.start}s has no valid end after it.`);
  }
  return w;
}

// Build the full render plan: for any time t, what layout is active + which stock clip.
// segments = ordered, non-overlapping [{ start, end, layout, stockIndex }]
function buildRenderPlan(parsed, opts = {}) {
  const total = opts.totalDuration || parsed.timestamps[parsed.timestamps.length - 1] || 0;
  const defaultLayout = opts.defaultLayout || 'stock-top'; // stock-top | darwin-top | full-darwin | full-stock
  // layoutOverrides: optional map stockIndex → layout (set by the editor's switcher)
  const overrides = opts.layoutOverrides || {};

  const segs = [];
  let cursor = 0;
  for (const block of parsed.splitBlocks) {
    if (block.start > cursor) {
      segs.push({ start: cursor, end: block.start, layout: 'full-darwin', stockIndex: null });
    }
    segs.push({
      start: block.start,
      end: block.end,
      layout: overrides[block.stockIndex] || defaultLayout,
      stockIndex: block.stockIndex,
    });
    cursor = block.end;
  }
  if (cursor < total) {
    segs.push({ start: cursor, end: total, layout: 'full-darwin', stockIndex: null });
  }
  return segs;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseDarwinScript, buildRenderPlan };
}
