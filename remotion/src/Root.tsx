import React from 'react';
import { Composition, getInputProps } from 'remotion';
import { TestimonialReel } from './TestimonialReel';

const FPS = 30;
const W = 1920;
const H = 1080;
const DEFAULT_DURATION_SEC = 240; // 4 minutes; overridden per-render via input props

// Default state used by `remotion studio` for local preview.
// Matches the editor's initial state shape exactly (same seed callouts).
const defaultState = {
  intro: {
    duration: 5.0,
    headline: 'Revolutionizing Frontline Workforce Benefits with Darwinbox',
    icon1: 'ITES',
    icon2: '3,000',
    icon3: 'US + 9 countries',
    portraitUrl: null,
  },
  namecard: {
    name: 'Marc Roos',
    role: 'CHRO',
    start: 5.0,
    end: 8.0,
  },
  global: {
    sourceVideoUrl: null,
    sourceVideoName: null,
    videoX_none: 0,
    videoY_none: 0,
    videoX_callout: 200,
    videoScale: 1.0,
    clientLogoUrl: null,
    clientLogoName: null,
  },
  callouts: [
    {
      id: 'c1',
      layout: 'meta_intro',
      start: 10,
      end: 22,
      content: {},
      items: [
        { iconKind: 'industry', text: 'Oil & Gas', time: 10 },
        { iconKind: 'employees', text: '6,000+', time: 10 },
        { iconKind: 'location', text: 'Thailand HQ, 5 countries', time: 10 },
      ],
    },
    {
      id: 'c2',
      layout: 'title_only_dark',
      start: 37,
      end: 62,
      content: {},
      items: [
        { icon: 'globe', title: 'Darwinbox Brings Cross-Geo Consistency', time: 37 },
      ],
    },
    {
      id: 'c3',
      layout: 'bullets_with_inline_metric',
      start: 84,
      end: 111,
      content: { title: 'Smoother Employee Experience' },
      items: [
        { text: 'Mobile-first interface', bold: '', time: 84 },
        { text: 'Anytime, anywhere access', bold: '', time: 87 },
        { text: 'Ownership of personal data', bold: '', time: 90 },
        { text: '100% paperless HR', bold: '', time: 93 },
      ],
    },
    {
      id: 'c4',
      layout: 'bullets_with_inline_metric',
      start: 111,
      end: 137,
      content: { title: 'HR Processes Harmonized, Globally' },
      items: [
        { text: 'Attendance registered and validated on system', bold: '', time: 111 },
        { text: 'Accurate, real-time data fed into payroll at month-end', bold: '', time: 120 },
        { text: 'Triggered simultaneously in all geos', bold: '', time: 130 },
      ],
    },
    {
      id: 'c5',
      layout: 'title_only_dark',
      start: 168,
      end: 183,
      content: {},
      items: [
        { icon: 'chart', title: 'Global Performance Management launched for the first time', time: 168 },
      ],
    },
    {
      id: 'c6',
      layout: 'title_only_dark',
      start: 200,
      end: 225,
      content: {},
      items: [
        { icon: 'users', title: 'Partnership approach of the Darwinbox team', time: 200 },
      ],
    },
  ],
};

// Calculate duration from inputs. If `totalDuration` is provided, use it.
// Otherwise compute from last callout end (+ small tail).
function computeDuration(input: any): number {
  if (input && typeof input.totalDuration === 'number') {
    return Math.max(10, Math.ceil(input.totalDuration));
  }
  if (input && Array.isArray(input.callouts) && input.callouts.length > 0) {
    const last = input.callouts.reduce(
      (max: number, c: any) => Math.max(max, c.end || 0),
      0
    );
    return Math.max(10, Math.ceil(last + 2));
  }
  return DEFAULT_DURATION_SEC;
}

export const Root: React.FC = () => {
  const inputProps = (getInputProps() as any) || {};
  const merged = Object.keys(inputProps).length > 0 ? inputProps : defaultState;
  const durSec = computeDuration(merged);

  return (
    <Composition
      id="TestimonialReel"
      component={TestimonialReel as any}
      durationInFrames={durSec * FPS}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={merged}
    />
  );
};
