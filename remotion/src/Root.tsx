import React from 'react';
import { Composition, getInputProps } from 'remotion';
import { TestimonialReel } from './TestimonialReel';
import { DarwinReel } from './DarwinReel';

const FPS = 30;
const W = 1920;
const H = 1080;
const DEFAULT_DURATION_SEC = 240;

// ── Testimonial default state (unchanged) ──────────────────────────────────
const defaultState = {
  intro: {
    duration: 5.0,
    headline: 'Revolutionizing Frontline Workforce Benefits with Darwinbox',
    icon1: 'ITES',
    icon2: '3,000',
    icon3: 'US + 9 countries',
    portraitUrl: null,
  },
  namecard: { name: 'Marc Roos', role: 'CHRO', start: 5.0, end: 8.0 },
  global: {
    sourceVideoUrl: null, sourceVideoName: null,
    videoX_none: 0, videoY_none: 0, videoX_callout: 200, videoScale: 1.0,
    clientLogoUrl: null, clientLogoName: null,
  },
  callouts: [],
};

function computeDuration(state: any): number {
  if (state?.global?.outro && state?.totalDuration) return state.totalDuration;
  if (state?.totalDuration) return state.totalDuration;
  if (Array.isArray(state?.callouts) && state.callouts.length > 0) {
    const last = state.callouts.reduce((max: number, c: any) => Math.max(max, c.end || 0), 0);
    return Math.max(10, Math.ceil(last + 2));
  }
  return DEFAULT_DURATION_SEC;
}

// ── Darwin Reel default state (for `remotion studio` preview) ──────────────
const darwinDefault = {
  darwinUrl: null,
  stockUrls: [],
  musicUrl: null,
  musicVolume: 0.15,
  // Sample segments matching the SAMPLE script (48s, 2 splits).
  segments: [
    { start: 0,  end: 8,  layout: 'full-darwin', stockIndex: null },
    { start: 8,  end: 18, layout: 'stock-top',   stockIndex: 0 },
    { start: 18, end: 25, layout: 'full-darwin', stockIndex: null },
    { start: 25, end: 38, layout: 'stock-top',   stockIndex: 1 },
    { start: 38, end: 48, layout: 'full-darwin', stockIndex: null },
  ],
  captions: [
    { text: "Hi, I'm Darwin. Today let's talk about how HR teams in BFSI handle compliance at scale.", start: 0, end: 8 },
    { text: 'The latest RBI guidelines mandate quarterly attestation of every employee record.', start: 8, end: 18 },
    { text: 'Darwinbox handles all of this natively. Let me show you how.', start: 18, end: 25 },
    { text: 'Our compliance module auto-flags missing attestations and routes them to the right approver.', start: 25, end: 38 },
    { text: 'So if your team is losing hours every quarter on RBI prep, Darwinbox gives you days back.', start: 38, end: 48 },
  ],
  totalDuration: 48,
};

const DARWIN_W = 1080;
const DARWIN_H = 1920;

export const Root: React.FC = () => {
  const inputProps = (getInputProps() as any) || {};

  // Testimonial composition props (only when not a Darwin render).
  const tMerged = Object.keys(inputProps).length > 0 && !inputProps.__darwin ? inputProps : defaultState;
  const tDur = computeDuration(tMerged);

  return (
    <>
      <Composition
        id="TestimonialReel"
        component={TestimonialReel as any}
        durationInFrames={Math.max(1, Math.round(tDur * FPS))}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={tMerged}
      />

      <Composition
        id="DarwinReel"
        component={DarwinReel as any}
        fps={FPS}
        width={DARWIN_W}
        height={DARWIN_H}
        durationInFrames={Math.max(1, Math.round((darwinDefault.totalDuration) * FPS))}
        defaultProps={darwinDefault as any}
        calculateMetadata={({ props }: any) => {
          // Duration comes from the props' totalDuration at render time.
          const total = props?.totalDuration || darwinDefault.totalDuration || 48;
          return { durationInFrames: Math.max(1, Math.round(total * FPS)), fps: FPS, width: DARWIN_W, height: DARWIN_H };
        }}
      />
    </>
  );
};
