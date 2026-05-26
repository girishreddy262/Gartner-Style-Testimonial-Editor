import React from 'react';
import { interpolate } from 'remotion';
import {
  INTRO_PILL_URL,
  DARWINBOX_LOGO_URL,
  getIntroIconUrl,
} from '../lib/assets';
import { EASE_OUT } from '../lib/animation';

// ============================================================
// INTRO SCENE — first 5 seconds of the video.
// ============================================================
//
// Layout matches the editor's intro state (canvas.intro-state):
//   - Dark navy canvas bg (#051A2D)
//   - Big blue gradient panel: left:60, top:60, 1800×797
//   - White footer band: left:60, top:857, 1800×163 (same as non-intro state)
//   - Inside blue panel:
//     - Pill at (152, 142), 364×51
//     - Headline at (152, 217), max-width ~880 (the editor's "intro-headline")
//     - 3 icons on the left:
//       industry  (157, 573)  46×40   label-text on the right
//       employees (152, 652)  56×37
//       location  (158, 722)  44×51
//     - Portrait at (1085, 171), 686×686
//
// Staggered entrance per editor (delays in ms after start):
//   0      pill + headline fade up
//   250    industry icon scale in
//   350    employees icon scale in, industry label fades in
//   400    portrait fades in
//   450    location icon scale in, employees label fades in
//   550    location label fades in
//   900    darwinbox logo scale in
//   1100   divider width animation
//   1600   client logo scale in
// After ~2s everything is fully visible. The intro holds for ~3s then fades out.

interface IntroProps {
  intro: {
    duration: number;
    headline: string;
    icon1: string;
    icon2: string;
    icon3: string;
    portraitUrl: string | null;
  };
  clientLogoUrl: string | null;
  t: number; // seconds from start of composition (0 to intro.duration)
}

// Animate a property from 0 -> 1 starting at delaySec, over durationSec, with easing.
const animValue = (t: number, delaySec: number, durationSec: number): number => {
  const elapsed = t - delaySec;
  if (elapsed <= 0) return 0;
  if (elapsed >= durationSec) return 1;
  return EASE_OUT(elapsed / durationSec);
};

export const Intro: React.FC<IntroProps> = ({ intro, clientLogoUrl, t }) => {
  const pillP = animValue(t, 0, 0.5);
  const headlineP = animValue(t, 0, 0.5);

  const industryIconP = animValue(t, 0.25, 0.4);
  const employeesIconP = animValue(t, 0.35, 0.4);
  const locationIconP = animValue(t, 0.45, 0.4);

  const industryLabelP = animValue(t, 0.35, 0.4);
  const employeesLabelP = animValue(t, 0.45, 0.4);
  const locationLabelP = animValue(t, 0.55, 0.4);

  const portraitP = animValue(t, 0.4, 0.6);
  const logoP = animValue(t, 0.9, 0.4);
  const dividerP = animValue(t, 1.1, 0.6);
  const clientLogoP = animValue(t, 1.6, 0.4);

  // Overall intro opacity (fades out near the end)
  const fadeOut = interpolate(t, [intro.duration - 0.2, intro.duration + 0.3], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#051A2D',
        opacity: fadeOut,
      }}
    >
      {/* BIG BLUE GRADIENT PANEL */}
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: 60,
          width: 1800,
          height: 797,
          borderRadius: '20px 20px 0 0',
          background: 'linear-gradient(180deg, #006DD5 0%, #0183FF 100%)',
          overflow: 'hidden',
        }}
      >
        {/* PILL */}
        <div
          style={{
            position: 'absolute',
            left: 152,
            top: 142,
            width: 364,
            height: 51,
            backgroundImage: `url('${INTRO_PILL_URL}')`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
            opacity: pillP,
            transform: `translateY(${(1 - pillP) * 12}px)`,
          }}
        />

        {/* HEADLINE */}
        <div
          style={{
            position: 'absolute',
            left: 152,
            top: 217,
            width: 880,
            color: '#fff',
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            opacity: headlineP,
            transform: `translateY(${(1 - headlineP) * 12}px)`,
          }}
        >
          {intro.headline}
        </div>

        {/* ICON: Industry */}
        <div
          style={{
            position: 'absolute',
            left: 157,
            top: 573,
            width: 46,
            height: 40,
            backgroundImage: `url('${getIntroIconUrl('industry')}')`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            opacity: industryIconP,
            transform: `scale(${industryIconP})`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 220,
            top: 573,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            color: '#fff',
            fontSize: 32,
            fontWeight: 500,
            opacity: industryLabelP,
          }}
        >
          {intro.icon1}
        </div>

        {/* ICON: Employees */}
        <div
          style={{
            position: 'absolute',
            left: 152,
            top: 652,
            width: 56,
            height: 37,
            backgroundImage: `url('${getIntroIconUrl('employees')}')`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            opacity: employeesIconP,
            transform: `scale(${employeesIconP})`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 220,
            top: 652,
            height: 37,
            display: 'flex',
            alignItems: 'center',
            color: '#fff',
            fontSize: 32,
            fontWeight: 500,
            opacity: employeesLabelP,
          }}
        >
          {intro.icon2}
        </div>

        {/* ICON: Location */}
        <div
          style={{
            position: 'absolute',
            left: 158,
            top: 722,
            width: 44,
            height: 51,
            backgroundImage: `url('${getIntroIconUrl('location')}')`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            opacity: locationIconP,
            transform: `scale(${locationIconP})`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 220,
            top: 722,
            height: 51,
            display: 'flex',
            alignItems: 'center',
            color: '#fff',
            fontSize: 32,
            fontWeight: 500,
            opacity: locationLabelP,
          }}
        >
          {intro.icon3}
        </div>

        {/* PORTRAIT */}
        <div
          style={{
            position: 'absolute',
            left: 1085,
            top: 171,
            width: 686,
            height: 686,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: portraitP,
          }}
        >
          {intro.portraitUrl ? (
            <img
              src={intro.portraitUrl}
              alt="Speaker portrait"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center top',
                filter: 'grayscale(100%) contrast(1.05)',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'rgba(255,255,255,0.05)',
                border: '2px dashed rgba(255,255,255,0.25)',
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.5)',
                fontSize: 32,
              }}
            >
              (no portrait)
            </div>
          )}
        </div>
      </div>

      {/* WHITE FOOTER BAND (same as non-intro) */}
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: 857,
          width: 1800,
          height: 163,
          background: '#fff',
          borderRadius: '0 0 20px 20px',
        }}
      >
        {/* Darwinbox logo with scale-in animation */}
        <div
          style={{
            position: 'absolute',
            left: 92,
            top: 56,
            width: 230,
            height: 52,
            backgroundImage: `url('${DARWINBOX_LOGO_URL}')`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'contain',
            backgroundPosition: 'left center',
            opacity: logoP,
            transform: `scale(${0.6 + logoP * 0.4})`,
          }}
        />

        {/* Divider (animated width) */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: dividerP * 962,
            height: 1,
            background: '#e5e7eb',
          }}
        />

        {/* Client logo (right) */}
        <div
          style={{
            position: 'absolute',
            right: 92,
            top: '50%',
            transform: `translateY(-50%) scale(${0.6 + clientLogoP * 0.4})`,
            height: 90,
            width: 250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            opacity: clientLogoP,
            ...(clientLogoUrl
              ? {}
              : {
                  background: '#f9fafb',
                  border: '1px dashed #d1d5db',
                  borderRadius: 8,
                }),
          }}
        >
          {clientLogoUrl ? (
            <img
              src={clientLogoUrl}
              alt="Client logo"
              style={{
                maxWidth: '90%',
                maxHeight: '90%',
                objectFit: 'contain',
              }}
            />
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>
              Client logo
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
