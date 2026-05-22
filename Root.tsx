import React from 'react';
import { Composition, getInputProps } from 'remotion';
import { TestimonialReel } from './TestimonialReel';

const FPS = 30;
const W = 1920, H = 1080;

// Defaults so `remotion studio` works without a real job.json
const defaultJob = {
  jobId: 'preview',
  videoUrl: '',
  videoFileName: '',
  totalDuration: 30,
  introScene: {
    headline: 'HR Transformation for a Multi-Geo Enterprise',
    name: 'Marc Roos',
    role: 'CHRO',
    tag: 'Oil & Gas · 6,000+ employees · Thailand HQ',
    portraitPath: null,
    logoPath: null
  },
  namecard: { name: 'Marc Roos', designation: 'CHRO' },
  scenes: [],
  frameSettings: {
    full:   { x: 90,  y: 61,  w: 1766, h: 967 },
    shrunk: { x: 617, y: 112, w: 1241, h: 856 }
  }
};

export const Root: React.FC = () => {
  const inputProps = (getInputProps() as any) || {};
  const job = Object.keys(inputProps).length > 0 ? inputProps : defaultJob;
  const durSec = Math.max(10, Math.ceil(job.totalDuration || 30));
  return (
    <Composition
      id="TestimonialReel"
      component={TestimonialReel as any}
      durationInFrames={durSec * FPS}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={job}
    />
  );
};
