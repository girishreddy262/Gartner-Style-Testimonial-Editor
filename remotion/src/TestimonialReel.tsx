import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
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
        {/* INTRO (0 .. intro.duration + 0.3s) */}
        {t < introDuration + 0.3 && (
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
      </AbsoluteFill>
    </>
  );
};
