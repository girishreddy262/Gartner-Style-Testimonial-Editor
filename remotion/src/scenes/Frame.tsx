import React from 'react';
import { Video, OffthreadVideo, useVideoConfig } from 'remotion';
import { DARWINBOX_LOGO_URL } from '../lib/assets';

// ============================================================
// FRAME — the rounded rectangle holding the speaker video + footer band.
// ============================================================
//
// Layout (from editor.html):
//   No callout active:
//     video-mask:  left: 60,  top: 60,  right: 60   → (60, 60, 1800×797)
//     footer:      left: 60,  top: 857, width: 1800 → (60, 857, 1800×163)
//     divider width: 962
//
//   Callout active:
//     video-mask:  left: 620                       → (620, 60, 1240×797)
//     footer:      left: 620, width: 1240           → (620, 857, 1240×163)
//     divider width: 389
//
// Video crop:
//   video-inner is 2400px wide, inside mask. Centered by default.
//   `videoX_*` shifts horizontally (translateX). `videoY_*` vertical.
//   `videoScale` scales the inner.

interface FrameProps {
  videoUrl: string | null;
  global: {
    videoX_none: number;
    videoY_none: number;
    videoX_callout: number;
    videoScale: number;
    videoTrimStart?: number; // seconds — start of source video to play from
    videoTrimEnd?: number;   // seconds — end of source video (0 or unset = play to end)
    clientLogoUrl: string | null;
  };
  calloutActive: boolean;
}

export const Frame: React.FC<FrameProps> = ({
  videoUrl,
  global,
  calloutActive,
}) => {
  const { fps } = useVideoConfig();
  // Video mask dimensions
  const maskLeft = calloutActive ? 620 : 60;
  const maskTop = 60;
  const maskRight = 60;
  const maskBottom = 223; // canvas - footer (857) - 0 = 1080 - 857 = 223
  const maskWidth = 1920 - maskLeft - maskRight;
  const maskHeight = 1080 - maskTop - maskBottom;

  // Footer band dimensions
  const footerLeft = calloutActive ? 620 : 60;
  const footerWidth = calloutActive ? 1240 : 1800;
  const footerTop = 857;
  const footerHeight = 163;

  // Divider width
  const dividerWidth = calloutActive ? 389 : 962;

  // Video positioning
  const videoX = calloutActive ? global.videoX_callout : global.videoX_none;
  const videoY = global.videoY_none;
  const videoScale = global.videoScale || 1.0;

  return (
    <>
      {/* VIDEO MASK */}
      <div
        style={{
          position: 'absolute',
          left: maskLeft,
          top: maskTop,
          width: maskWidth,
          height: maskHeight,
          borderRadius: '20px 20px 0 0',
          overflow: 'hidden',
          background: '#1a1a1a',
        }}
      >
        {videoUrl ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              height: '100%',
              width: 2400,
              left: `calc(50% - ${1200}px + ${videoX}px)`,
              transform: `translateY(${videoY}px) scale(${videoScale})`,
              transformOrigin: 'center center',
            }}
          >
            <OffthreadVideo
              src={videoUrl}
              startFrom={Math.round((global.videoTrimStart || 0) * fps)}
              endAt={
                global.videoTrimEnd && global.videoTrimEnd > 0
                  ? Math.round(global.videoTrimEnd * fps)
                  : undefined
              }
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
              }}
            />
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 48,
              fontWeight: 500,
            }}
          >
            (no video uploaded)
          </div>
        )}
      </div>

      {/* FOOTER BAND */}
      <div
        style={{
          position: 'absolute',
          left: footerLeft,
          top: footerTop,
          width: footerWidth,
          height: footerHeight,
          background: '#fff',
          borderRadius: '0 0 20px 20px',
        }}
      >
        {/* Darwinbox logo (left) */}
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
          }}
        />

        {/* Divider */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: dividerWidth,
            height: 1,
            background: '#e5e7eb',
          }}
        />

        {/* Client logo slot (right) */}
        <div
          style={{
            position: 'absolute',
            right: 92,
            top: '50%',
            transform: 'translateY(-50%)',
            height: 90,
            width: 250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            ...(global.clientLogoUrl
              ? {}
              : {
                  background: '#f9fafb',
                  border: '1px dashed #d1d5db',
                  borderRadius: 8,
                }),
          }}
        >
          {global.clientLogoUrl ? (
            <img
              src={global.clientLogoUrl}
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
    </>
  );
};
