import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Audio,
  Sequence,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
} from 'remotion';

// =============================================================================
// DarwinReel: vertical (1080x1920) reel composition.
// Consumes a render plan from darwin-parser.js (buildRenderPlan + applyDarwinClips).
//
// ARCHITECTURE (audio continuity + trim/cut + per-clip transforms):
//   - The Darwin take is the audio spine. With NO cuts it is ONE continuous
//     OffthreadVideo (no remount -> no clicks). With trim/cut, `darwinClips`
//     describes the KEPT source ranges; the base layer plays them back-to-back.
//   - Split visuals are OVERLAYS. In a split we draw a SECOND, MUTED, cropped
//     copy of Darwin for its half, seeked (startFrom = seg.srcStart) to stay in
//     sync with the base. Audio always comes from the base layer only.
//   - Per-clip transforms (clipTransforms) frame each placed instance:
//       stock-{k}  stock clip in split k  (scale, x, y, trimIn, trimOut)
//       dhalf-{k}  Darwin half in split k (scale, x, y)
//       dfull      full-frame Darwin, global (scale, x, y)
//     scale/x/y become a CSS transform on the object-fit:cover element; stock
//     trimIn/trimOut select the source range that fills the slot.
//
// `segments`, `captions`, `darwinClips` are in OUTPUT time (post-cut).
// =============================================================================

const W = 1080;
const H = 1920;
const HALF = H / 2; // 960

type Layout = 'stock-top' | 'darwin-top' | 'full-darwin' | 'full-stock';
type Segment = { start: number; end: number; layout: Layout; stockIndex: number | null; srcStart?: number };
type Caption = { text: string; start: number; end: number };
type Clip = { srcStart: number; srcEnd: number; outStart: number; outEnd: number };
type Tx = { scale?: number; x?: number; y?: number; trimIn?: number; trimOut?: number };

export const DarwinReel: React.FC<{
  darwinUrl?: string | null;
  stockUrls?: string[];
  musicUrl?: string | null;
  musicVolume?: number;
  segments?: Segment[];
  captions?: Caption[];
  darwinClips?: Clip[];
  clipTransforms?: Record<string, Tx>;
  totalDuration?: number;
  captionStyle?: Partial<CaptionStyle>;
}> = ({
  darwinUrl = null,
  stockUrls = [],
  musicUrl = null,
  musicVolume = 0.15,
  segments = [],
  captions = [],
  darwinClips = [],
  clipTransforms = {},
  totalDuration = 0,
  captionStyle = {},
}) => {
  const { fps } = useVideoConfig();
  const outTotal = totalDuration || (segments.length ? segments[segments.length - 1].end : 0);

  const txStyle = (key: string): React.CSSProperties => {
    const t = clipTransforms[key] || {};
    const s = t.scale != null ? t.scale : 1, x = t.x || 0, y = t.y || 0;
    return { transform: `translate(${x}%, ${y}%) scale(${s})`, transformOrigin: 'center center' };
  };

  const clips: Clip[] =
    darwinClips && darwinClips.length
      ? darwinClips
      : [{ srcStart: 0, srcEnd: outTotal, outStart: 0, outEnd: outTotal }];

  const darwinPiece = (c: Clip, muted: boolean, txKey: string, objectPosition = 'center top') =>
    darwinUrl ? (
      <OffthreadVideo
        src={darwinUrl}
        muted={muted}
        startFrom={Math.round(c.srcStart * fps)}
        endAt={Math.max(Math.round(c.srcStart * fps) + 1, Math.round(c.srcEnd * fps))}
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition, ...txStyle(txKey) }}
      />
    ) : (
      <PlaceholderBox label="Darwin video" />
    );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* BASE: continuous Darwin spine, played as one-or-more kept clips */}
      {clips.map((c, i) => (
        <Sequence
          key={`base-${i}`}
          from={Math.round(c.outStart * fps)}
          durationInFrames={Math.max(1, Math.round((c.outEnd - c.outStart) * fps))}
          layout="none"
        >
          <AbsoluteFill>{darwinPiece(c, false, 'dfull')}</AbsoluteFill>
        </Sequence>
      ))}

      {/* OVERLAYS: one per segment that changes the visual */}
      {segments.map((seg, i) => {
        if (seg.layout === 'full-darwin') return null;
        const fromF = Math.round(seg.start * fps);
        const durF = Math.max(1, Math.round((seg.end - seg.start) * fps));
        const stockUrl = seg.stockIndex != null ? stockUrls[seg.stockIndex] : null;
        const stockKey = `stock-${seg.stockIndex}`;
        const st = clipTransforms[stockKey] || {};
        const sStart = seg.srcStart != null ? seg.srcStart : seg.start;
        const segClip: Clip = { srcStart: sStart, srcEnd: sStart + (seg.end - seg.start), outStart: seg.start, outEnd: seg.end };
        return (
          <Sequence key={`ov-${i}`} from={fromF} durationInFrames={durF} layout="none">
            <SegmentOverlay
              layout={seg.layout}
              stockUrl={stockUrl}
              stockTrim={{ trimIn: st.trimIn || 0, trimOut: st.trimOut || 0 }}
              slotDuration={seg.end - seg.start}
              stockStyle={txStyle(stockKey)}
              darwinMutedCopy={darwinPiece(segClip, true, `dhalf-${seg.stockIndex}`)}
            />
          </Sequence>
        );
      })}

      {/* CAPTIONS */}
      {captions.map((cap, i) => (
        <Sequence
          key={`cap-${i}`}
          from={Math.round(cap.start * fps)}
          durationInFrames={Math.max(1, Math.round((cap.end - cap.start) * fps))}
          layout="none"
        >
          <CaptionView text={cap.text} style={captionStyle} />
        </Sequence>
      ))}

      {/* BACKGROUND MUSIC */}
      {musicUrl ? <Audio src={musicUrl} volume={musicVolume} /> : null}
    </AbsoluteFill>
  );
};

const SegmentOverlay: React.FC<{
  layout: Layout;
  stockUrl: string | null;
  stockTrim: { trimIn: number; trimOut: number };
  slotDuration: number;
  stockStyle: React.CSSProperties;
  darwinMutedCopy: React.ReactNode;
}> = ({ layout, stockUrl, stockTrim, slotDuration, stockStyle, darwinMutedCopy }) => {
  const { fps } = useVideoConfig();
  const tin = stockTrim?.trimIn || 0;
  const tout = stockTrim?.trimOut || 0;
  const endSec = tout > tin ? tout : tin + slotDuration;
  const stock = stockUrl ? (
    <OffthreadVideo
      src={stockUrl}
      muted
      startFrom={Math.round(tin * fps)}
      endAt={Math.max(Math.round(tin * fps) + 1, Math.round(endSec * fps))}
      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', ...stockStyle }}
    />
  ) : (
    <PlaceholderBox label="Stock clip" />
  );

  const half = (top: boolean, child: React.ReactNode) => (
    <div style={{ position: 'absolute', top: top ? 0 : HALF, left: 0, width: W, height: HALF, overflow: 'hidden' }}>
      {child}
    </div>
  );

  if (layout === 'full-stock') return <AbsoluteFill style={{ overflow: 'hidden' }}>{stock}</AbsoluteFill>;
  if (layout === 'darwin-top') {
    return (
      <AbsoluteFill>
        {half(true, darwinMutedCopy)}
        {half(false, stock)}
      </AbsoluteFill>
    );
  }
  // stock-top (default)
  return (
    <AbsoluteFill>
      {half(true, stock)}
      {half(false, darwinMutedCopy)}
    </AbsoluteFill>
  );
};

type CaptionStyle = {
  fontFamily: string; fontSize: number; color: string; bg: string;
  bottom: number; fontWeight: number; maxWidth: number;
};
const DEFAULT_CAPTION: CaptionStyle = {
  fontFamily: 'Inter, system-ui, sans-serif', fontSize: 52, color: '#FFFFFF',
  bg: 'rgba(0,0,0,0.55)', bottom: 220, fontWeight: 700, maxWidth: 920,
};

const CaptionView: React.FC<{ text: string; style: Partial<CaptionStyle> }> = ({ text, style }) => {
  const s = { ...DEFAULT_CAPTION, ...style };
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: s.bottom }}>
      <div style={{
        opacity, maxWidth: s.maxWidth, margin: '0 60px', padding: '18px 30px',
        background: s.bg, borderRadius: 18, color: s.color, fontFamily: s.fontFamily,
        fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: 1.25, textAlign: 'center',
      }}>
        {text}
      </div>
    </AbsoluteFill>
  );
};

const PlaceholderBox: React.FC<{ label: string }> = ({ label }) => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', background: '#11161d' }}>
    <div style={{ color: '#3a4654', fontFamily: 'monospace', fontSize: 28 }}>{label}</div>
  </AbsoluteFill>
);
