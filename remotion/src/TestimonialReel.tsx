import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
} from 'remotion';
import { Intro } from './scenes/Intro';
import { Frame } from './scenes/Frame';
import { Namecard } from './scenes/Namecard';
import { Callout } from './scenes/Callout';

// ============================================================
// TESTIMONIAL REEL — top-level composition.
// ============================================================
//
// Matches the editor's state model. Input props:
//   intro: { duration, headline, icon1, icon2, icon3, portraitUrl }
//   namecard: { name, role, start, end }
//   global: { sourceVideoUrl, videoX_none, videoY_none, videoX_callout, videoScale, clientLogoUrl }
//   callouts: [{ id, layout, start, end, content, items }]
//
// Layering (bottom → top):
//   1. Canvas background (#EBF3FE non-intro, #051A2D intro)
//   2. During intro (t < intro.duration): Intro scene (full overlay)
//   3. After intro: Frame (video + footer band + logo + divider + client logo)
//   4. After intro: Namecard overlay (if t in [namecard.start, namecard.end])
//   5. Active callout (if any) — positioned on the left

interface Props {
  intro: any;
  namecard: any;
  global: any;
  callouts: any[];
}

// Load Satoshi font from Fontshare CDN. Remotion delays first render until loaded.
const loadFonts = async () => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href =
    'https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap';
  document.head.appendChild(link);

  // Wait for the font to actually be loaded by the browser
  await document.fonts.ready;
};

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

  // Font loading — block render until Satoshi is ready
  const [handle] = useState(() => delayRender('Loading Satoshi font'));
  useEffect(() => {
    loadFonts()
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle)); // continue even on failure
  }, [handle]);

  return (
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
  );
};
