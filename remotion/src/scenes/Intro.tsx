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
// IMPORTANT — coordinate space.
// Every value below is an ABSOLUTE CANVAS coordinate (1920x1080 origin at the
// top-left of the frame), exactly matching the editor's CSS in docs/editor.html.
// In the editor the pill / headline / icons / portrait are SIBLINGS of
// .intro-blue-panel, not children of it, so their `top` is measured from the
// canvas and not from the panel. Nesting them inside the panel (which sits at
// 60,60) shifted everything down and right by 60px and clipped the portrait
// against the panel's overflow:hidden. Keep them as siblings here.
//
// Canvas layout (matches .canvas.intro-state):
//   Dark navy canvas bg     #051A2D
//   Blue gradient panel     left 60   top 60    1800x797   radius 20 20 0 0
//   White footer band       left 60   top 857   1800x163   radius 0 0 20 20
//   Pill                    left 152  top 142   364x51
//   Headline                left 152  top 212   width 900
//   Icon industry           left 157  top 573   46x40
//   Icon employees          left 152  top 652   56x37
//   Icon location           left 158  top 722   44x51
//   Icon labels             left 235  (vertically centred on the icon row)
//   Portrait                left 1085 top 171   686x686
//
// Staggered entrance (seconds after intro start):
//   0.00  pill + headline fade up
//   0.25  industry icon scales in
//   0.35  employees icon scales in, industry label fades in
//   0.40  portrait fades in
//   0.45  location icon scales in, employees label fades in
//   0.55  location label fades in
//   0.90  darwinbox logo scales in
//   1.10  divider width animates
//   1.60  client logo scales in

// Design constants — single source of truth for the canvas layout.
const PANEL = { left: 60, top: 60, width: 1800, height: 797 };
const FOOTER = { left: 60, top: 857, width: 1800, height: 163 };
const LABEL_LEFT = 235;
const LABEL_FONT_SIZE = 44;
const LABEL_FONT_WEIGHT = 400;
export const DEFAULT_HEADLINE_SIZE = 72;

const ICON_ROWS = [
  { key: 'industry',  left: 157, top: 573, width: 46, height: 40 },
  { key: 'employees', left: 152, top: 652, width: 56, height: 37 },
  { key: 'location',  left: 158, top: 722, width: 44, height: 51 },
] as const;

interface IntroProps {
  intro: {
    duration: number;
    headline: string;
    // Optional override for the headline font size, in canvas px.
    // Set from the editor's "Headline size" control. Defaults to 72.
    headlineSize?: number | null;
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

  const iconP = [
    animValue(t, 0.25, 0.4),
    animValue(t, 0.35, 0.4),
    animValue(t, 0.45, 0.4),
  ];
  const labelP = [
    animValue(t, 0.35, 0.4),
    animValue(t, 0.45, 0.4),
    animValue(t, 0.55, 0.4),
  ];

  const portraitP = animValue(t, 0.4, 0.6);
  const logoP = animValue(t, 0.9, 0.4);
  const dividerP = animValue(t, 1.1, 0.6);
  const clientLogoP = animValue(t, 1.6, 0.4);

  // Overall intro opacity. Must be FULLY faded out BY intro.duration — the
  // moment the speaker video begins — otherwise the fading intro lingers on top
  // of the playing video. So we fade over [duration-0.5, duration-0.05] → gone
  // just before the boundary.
  const fadeOut = interpolate(t, [intro.duration - 0.5, intro.duration - 0.05], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const headlineSize =
    typeof intro.headlineSize === 'number' && intro.headlineSize > 0
      ? intro.headlineSize
      : DEFAULT_HEADLINE_SIZE;

  const labels = [intro.icon1, intro.icon2, intro.icon3];

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#051A2D',
        opacity: fadeOut,
      }}
    >
      {/* BLUE GRADIENT PANEL — background only. Content sits on top of it as
          siblings, in canvas coordinates, so nothing is offset or clipped. */}
      <div
        style={{
          position: 'absolute',
          left: PANEL.left,
          top: PANEL.top,
          width: PANEL.width,
          height: PANEL.height,
          borderRadius: '20px 20px 0 0',
          background: 'linear-gradient(180deg, #006DD5 0%, #0183FF 100%)',
        }}
      />

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
          top: 212,
          width: 900,
          color: '#fff',
          fontSize: headlineSize,
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: '-0.01em',
          opacity: headlineP,
          transform: `translateY(${(1 - headlineP) * 12}px)`,
        }}
      >
        {intro.headline}
      </div>

      {/* META ICONS + LABELS */}
      {ICON_ROWS.map((row, i) => (
        <React.Fragment key={row.key}>
          <div
            style={{
              position: 'absolute',
              left: row.left,
              top: row.top,
              width: row.width,
              height: row.height,
              backgroundImage: `url('${getIntroIconUrl(row.key)}')`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              opacity: iconP[i],
              transform: `scale(${0.6 + iconP[i] * 0.4})`,
            }}
          />
          {/* NOTE: block, not flex. In the editor the rule
              `.canvas.intro-state .intro-icon-label { display: block }`
              out-specifies the per-row `display:flex; align-items:center`,
              so the label text actually sits at the TOP of its box rather
              than centred. Matching that exactly keeps the render aligned
              with the editor preview. */}
          <div
            style={{
              position: 'absolute',
              left: LABEL_LEFT,
              top: row.top,
              height: row.height,
              color: '#fff',
              fontSize: LABEL_FONT_SIZE,
              fontWeight: LABEL_FONT_WEIGHT,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              opacity: labelP[i],
            }}
          >
            {labels[i]}
          </div>
        </React.Fragment>
      ))}

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

      {/* WHITE FOOTER BAND */}
      <div
        style={{
          position: 'absolute',
          left: FOOTER.left,
          top: FOOTER.top,
          width: FOOTER.width,
          height: FOOTER.height,
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
