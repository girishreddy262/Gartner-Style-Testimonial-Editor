import React from 'react';
import { Video, interpolate, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

interface Props {
  videoUrl: string;
  frameSettings: { full: any; shrunk: any };
  calloutActive: boolean;
  namecard: any;
  showNamecard: boolean;
}

export const FrameGroup: React.FC<Props> = ({
  videoUrl, frameSettings, calloutActive, namecard, showNamecard
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { full, shrunk } = frameSettings;
  const targetSx = calloutActive ? shrunk.w / full.w : 1;
  const targetSy = calloutActive ? shrunk.h / full.h : 1;
  const targetTx = calloutActive ? shrunk.x : full.x;
  const targetTy = calloutActive ? shrunk.y : full.y;

  const sx = targetSx;
  const sy = targetSy;
  const tx = targetTx;
  const ty = targetTy;

  return (
    <div style={{
      position: 'absolute', left: 0, top: 0,
      width: full.w, height: full.h,
      background: '#fff', borderRadius: 12,
      boxShadow: '0 4px 24px rgba(5, 26, 45, 0.18)',
      transformOrigin: '0 0',
      transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`,
      overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: full.w, height: full.h - 80, background: '#1a2332', overflow: 'hidden' }}>
        {videoUrl && (
          <Video
            src={videoUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            muted={false}
            startFrom={0}
          />
        )}
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 80,
        background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 50px', borderTop: '1px solid #E5EEF7'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, background: '#003B73', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: 18, fontFamily: 'serif'
          }}>d</div>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#051A2D', letterSpacing: '-0.5px', fontFamily: 'Inter, sans-serif' }}>darwinbox</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#2C7A2C', letterSpacing: 1, fontFamily: 'Inter, sans-serif' }}>CR3</div>
      </div>

      {/* Namecard */}
      {showNamecard && namecard && (
        <div style={{
          position: 'absolute', right: 60, bottom: 110,
          background: 'rgba(255,255,255,0.95)', padding: '14px 24px', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          opacity: calloutActive ? 1 : 0.92,
          fontFamily: 'Inter, sans-serif'
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#051A2D', lineHeight: 1.2 }}>{namecard.name}</div>
          <div style={{ fontSize: 16, color: '#003B73', marginTop: 2 }}>{namecard.designation}</div>
        </div>
      )}
    </div>
  );
};
