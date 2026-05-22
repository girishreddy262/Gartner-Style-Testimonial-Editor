import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { IntroScene } from './scenes/Intro';
import { FrameGroup } from './scenes/FrameGroup';
import { ContentCallout } from './scenes/ContentCallout';
import { MetaCallout } from './scenes/MetaCallout';

const INTRO_END = 5;
const VIDEO_START = 5;

interface Props {
  jobId: string;
  videoUrl: string;
  totalDuration: number;
  introScene: any;
  namecard: any;
  scenes: any[];
  frameSettings: { full: any; shrunk: any };
}

export const TestimonialReel: React.FC<Props> = ({
  videoUrl, introScene, namecard, scenes, frameSettings
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const introEndFrame = INTRO_END * fps;
  const videoStartFrame = VIDEO_START * fps;

  // Determine if a callout is active right now (drives the shrink)
  const activeCallout = scenes.find(s => t >= s.start && t < s.end && (s.type === 'content' || s.type === 'meta'));
  const calloutActive = !!activeCallout;

  return (
    <AbsoluteFill style={{ background: '#EBF3FE' }}>
      {/* INTRO (0-5s, fades out at end) */}
      <Sequence from={0} durationInFrames={Math.ceil((INTRO_END + 0.3) * fps)}>
        <AbsoluteFill style={{
          opacity: t < INTRO_END - 0.2 ? 1 : interpolate(t, [INTRO_END - 0.2, INTRO_END + 0.3], [1, 0], { extrapolateRight: 'clamp' })
        }}>
          <IntroScene {...introScene} t={t} />
        </AbsoluteFill>
      </Sequence>

      {/* VIDEO + FRAME (5s onward) */}
      <Sequence from={videoStartFrame}>
        <AbsoluteFill style={{
          opacity: interpolate(t, [INTRO_END - 0.3, INTRO_END + 0.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        }}>
          <FrameGroup
            videoUrl={videoUrl}
            frameSettings={frameSettings}
            calloutActive={calloutActive}
            namecard={namecard}
            showNamecard={t > VIDEO_START + 0.5}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Callout overlay (renders on top of everything; positioned in the left band) */}
      {activeCallout && t > INTRO_END - 0.3 && (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: 618, height: 1080,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 40px'
          }}>
            {activeCallout.type === 'meta'
              ? <MetaCallout scene={activeCallout} t={t} />
              : <ContentCallout scene={activeCallout} t={t} />}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
