import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  OffthreadVideo,
} from 'remotion';
import { Intro } from './scenes/Intro';
import { Frame } from './scenes/Frame';
import { Namecard } from './scenes/Namecard';
import { Callout } from './scenes/Callout';
import { SATOSHI_FONT_CSS } from './lib/fonts';

// ============================================================
// TESTIMONIAL REEL — top-level composition.
// ============================================================
//
// Structure:
//   - Intro (0 .. introDuration + 0.3s overlap)
//   - Speaker video Frame wrapped in <Sequence from={introFrames}> so the
//     source video plays from its t=0 starting when the intro ends.
//   - Namecard overlay (3s after intro)
//   - Callouts overlay (based on each callout's start/end)

// Full-screen flash transition (diagonal sweep) — same visual as the clip flash
// but covers the entire frame. Used straddling the video→outro cut. p in 0..1.
const FS_TRANSITION_DUR = 1.0;
const FsFlash: React.FC<{ p: number }> = ({ p }) => {
  const smooth = (e: number) => { e = Math.min(1, Math.max(0, e)); return e * e * (3 - 2 * e); };
  const bump = (x: number, peak: number) => (x <= 0 || x >= 1) ? 0 : (x < peak ? smooth(x / peak) : smooth((1 - x) / (1 - peak)));
  const e = smooth(p);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', filter: 'blur(8px)', zIndex: 100 }}>
      <div style={{
        position: 'absolute', width: '170%', height: '170%',
        left: (100 - e * 100) + '%', top: (e * 100) + '%',
        transform: `translate(-50%,-50%) scale(${0.5 + e * 1.3})`,
        opacity: bump(p, 0.42) * 0.95,
        background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(225,200,255,0.6) 18%, rgba(170,190,255,0.32) 34%, rgba(255,170,220,0.16) 50%, rgba(170,190,255,0.06) 68%, rgba(170,190,255,0) 100%)',
      }} />
      <div style={{
        position: 'absolute', inset: '-30%', opacity: bump(p, 0.45) * 0.5,
        background: 'linear-gradient(225deg, rgba(255,255,255,0.5) 0%, rgba(210,180,255,0.18) 35%, rgba(255,255,255,0) 70%)',
      }} />
      <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: bump(p, 0.5) * 0.95 }} />
    </div>
  );
};

interface Props {
  intro: any;
  namecard: any;
  global: any;
  callouts: any[];
}

export const TestimonialReel: React.FC<Props> = ({
  intro,
  namecard,
  global,
  callouts,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const introDuration = intro?.duration || 5;
  const introFrames = Math.round(introDuration * fps);
  const inIntro = t < introDuration;

  // Find the active callout (if any)
  const activeCallout = (callouts || []).find(
    (c: any) => t >= c.start && t <= c.end
  );

  // Smooth callout-active progress (0 → 1) for the video mask transition.
  // The video shifts right when a callout is on screen. To avoid a hard snap,
  // we ease this over TRANSITION seconds at each callout's start and end.
  const TRANSITION = 0.5;
  let calloutProgress = 0;
  for (const c of (callouts || [])) {
    // Progress ramps 0→1 over [start, start+T], stays 1, ramps 1→0 over [end-T, end]
    if (t >= c.start - TRANSITION && t <= c.end + TRANSITION) {
      const rampIn = Math.max(0, Math.min(1, (t - c.start) / TRANSITION));
      const rampOut = Math.max(0, Math.min(1, (c.end - t) / TRANSITION));
      // ease-out curve for both ramps
      const easeIn = 1 - Math.pow(1 - rampIn, 2);
      const easeOut = 1 - Math.pow(1 - rampOut, 2);
      const p = Math.min(easeIn, easeOut);
      if (p > calloutProgress) calloutProgress = p;
    }
  }

  return (
    <>
      {/* Inject Satoshi font once — base64 embedded, no network */}
      <style dangerouslySetInnerHTML={{ __html: SATOSHI_FONT_CSS }} />
      <AbsoluteFill
        style={{
          background: inIntro ? '#051A2D' : '#EBF3FE',
          fontFamily:
            "'Satoshi', -apple-system, BlinkMacSystemFont, Inter, sans-serif",
        }}
      >
        {/* INTRO (0 .. intro.duration). Fully unmounts when the video begins so
            its fade never lingers on top of the playing video. */}
        {t < introDuration && (
          <Intro
            intro={intro}
            clientLogoUrl={global?.clientLogoUrl}
            t={t}
          />
        )}

        {/* SPEAKER VIDEO in a Sequence — starts playing at intro end.
            Wrapping in <Sequence from={introFrames}> means: the inner content
            sees time as t=0 when the composition is at t=introDuration. So
            OffthreadVideo plays the source from its actual start (t=0) at the
            moment the intro ends, instead of jumping into mid-source. */}
        <Sequence from={introFrames} durationInFrames={durationInFrames - introFrames}>
          <Frame
            videoUrl={global?.sourceVideoUrl || null}
            global={global || {}}
            calloutActive={!!activeCallout}
            calloutProgress={calloutProgress}
          />
        </Sequence>

        {/* NAMECARD overlay (uses outer composition time, not Sequence time) */}
        {!inIntro && namecard && (
          <Namecard
            name={namecard.name}
            role={namecard.role}
            start={namecard.start}
            end={namecard.end}
            t={t}
          />
        )}

        {/* CALLOUT overlay (uses outer composition time) */}
        {!inIntro && activeCallout && <Callout callout={activeCallout} t={t} />}

        {/* OUTRO — fixed brand outro appended at the very end, full-frame + audio.
            outroStart = total - outroDuration. Played via a Sequence so the MP4
            starts from its own t=0 when the outro begins. */}
        {global?.outro && global?.outroUrl && (() => {
          const outroDur = global.outroDuration || 4.0;
          const totalSec = durationInFrames / fps;
          const outroStartSec = totalSec - outroDur;
          const outroStartFrame = Math.round(outroStartSec * fps);
          const outroFrames = Math.max(1, durationInFrames - outroStartFrame);
          // Full-screen flash straddles the cut (half before, half after)
          const fStart = outroStartSec - FS_TRANSITION_DUR / 2;
          const showFlash = t >= fStart && t <= fStart + FS_TRANSITION_DUR;
          const flashP = showFlash ? (t - fStart) / FS_TRANSITION_DUR : 0;
          return (
            <>
              <Sequence from={outroStartFrame} durationInFrames={outroFrames}>
                <AbsoluteFill style={{ background: '#000' }}>
                  <OffthreadVideo
                    src={global.outroUrl}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </AbsoluteFill>
              </Sequence>
              {showFlash && <FsFlash p={flashP} />}
            </>
          );
        })()}
      </AbsoluteFill>
    </>
  );
};
