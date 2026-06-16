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
// DarwinReel — vertical (1080x1920) reel composition.
// Consumes a render plan from darwin-parser.js buildRenderPlan().
//
// ARCHITECTURE (important for audio continuity):
//   - ONE continuous Darwin video at the base, playing 0..total. Its audio IS
//     the narration and is never interrupted (no per-segment remount → no clicks).
//   - Split visuals are OVERLAYS on top of that base, only where a segment needs
//     them. In split layouts we draw a SECOND, MUTED, cropped copy of Darwin for
//     the half it occupies — the audio always comes from the base layer only.
// =============================================================================

const W = 1080;
const H = 1920;
const HALF = H / 2; // 960

type Layout = 'stock-top' | 'darwin-top' | 'full-darwin' | 'full-stock';
type Segment = { start: number; end: number; layout: Layout; stockIndex: number | null };
type Caption = { text: string; start: number; end: number };

export const DarwinReel: React.FC<{
  darwinUrl?: string | null;
  stockUrls?: string[];
  musicUrl?: string | null;
  musicVolume?: number;
  segments?: Segment[];
  captions?: Caption[];
  totalDuration?: number;
  captionStyle?: Partial<CaptionStyle>;
}> = ({
  darwinUrl = null,
  stockUrls = [],
  musicUrl = null,
  musicVolume = 0.15,
  segments = [],
  captions = [],
  captionStyle = {},
}) => {
  const { fps } = useVideoConfig();

  const darwinFull = (muted: boolean) =>
    darwinUrl ? (
      <OffthreadVideo
        src={darwinUrl}
        muted={muted}
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
      />
    ) : (
      <PlaceholderBox label="Darwin video" />
    );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* BASE: continuous Darwin (audio spine, never interrupted) */}
      <AbsoluteFill>{darwinFull(false)}</AbsoluteFill>

      {/* OVERLAYS: one per segment that changes the visual */}
      {segments.map((seg, i) => {
        if (seg.layout === 'full-darwin') return null;
        const fromF = Math.round(seg.start * fps);
        const durF = Math.max(1, Math.round((seg.end - seg.start) * fps));
        const stockUrl = seg.stockIndex != null ? stockUrls[seg.stockIndex] : null;
        return (
          <Sequence key={`ov-${i}`} from={fromF} durationInFrames={durF} layout="none">
            <SegmentOverlay layout={seg.layout} stockUrl={stockUrl} darwinMutedCopy={darwinFull(true)} />
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
  darwinMutedCopy: React.ReactNode;
}> = ({ layout, stockUrl, darwinMutedCopy }) => {
  const stock = stockUrl ? (
    <OffthreadVideo src={stockUrl} muted style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
  ) : (
    <PlaceholderBox label="Stock clip" />
  );

  const half = (top: boolean, child: React.ReactNode) => (
    <div style={{ position: 'absolute', top: top ? 0 : HALF, left: 0, width: W, height: HALF, overflow: 'hidden' }}>
      {child}
    </div>
  );

  if (layout === 'full-stock') return <AbsoluteFill>{stock}</AbsoluteFill>;
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
