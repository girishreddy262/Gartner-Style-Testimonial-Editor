import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
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
// All assets are embedded — no network calls at render time except for the
// source video (which Lambda fetches from S3 via presigned URL).

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
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const introDuration = intro?.duration || 5;
  const inIntro = t < introDuration;

  // Find the active callout (if any)
  const activeCallout = (callouts || []).find(
    (c: any) => t >= c.start && t <= c.end
  );

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

        {/* MAIN STATE (after intro) */}
        {!inIntro && (
          <>
            <Frame
              videoUrl={global?.sourceVideoUrl || null}
              global={global || {}}
              calloutActive={!!activeCallout}
            />
            {namecard && (
              <Namecard
                name={namecard.name}
                role={namecard.role}
                start={namecard.start}
                end={namecard.end}
                t={t}
              />
            )}
            {activeCallout && <Callout callout={activeCallout} t={t} />}
          </>
        )}
      </AbsoluteFill>
    </>
  );
};
