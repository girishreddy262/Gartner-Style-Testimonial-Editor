import React from 'react';
import { interpolate, Easing } from 'remotion';

interface Props {
  headline: string;
  name: string;
  role: string;
  tag: string;
  portraitPath?: string | null;
  logoPath?: string | null;
  t: number;
}

export const IntroScene: React.FC<Props> = ({ headline, name, role, tag, portraitPath, t }) => {
  // Headline rises in 0–0.6s
  const hT = Math.min(t / 0.6, 1);
  const hE = 1 - Math.pow(1 - hT, 3);

  // Portrait clip 0.3–0.9s
  const pT = Math.min(Math.max((t - 0.3) / 0.6, 0), 1);
  const pE = 1 - Math.pow(1 - pT, 3);

  // Meta block 0.8–1.3s
  const mT = Math.min(Math.max((t - 0.8) / 0.5, 0), 1);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(135deg, #051A2D 0%, #003B73 50%, #0183FF 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        fontSize: 84, fontWeight: 700, color: '#fff',
        textAlign: 'center', maxWidth: 1400, lineHeight: 1.15, marginBottom: 40,
        opacity: hE,
        transform: `translateY(${20 * (1 - hE)}px) scale(${0.95 + 0.05 * hE})`,
        fontFamily: 'Inter, sans-serif'
      }}>{headline}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
        <div style={{
          width: 220, height: 220, borderRadius: '50%',
          background: portraitPath ? `url(${portraitPath}) center/cover` : '#1F8AFF',
          clipPath: `circle(${pE * 50}% at 50% 50%)`
        }} />
        <div style={{ textAlign: 'left', opacity: mT, fontFamily: 'Inter, sans-serif' }}>
          <div style={{ fontSize: 36, color: '#fff', fontWeight: 500, marginBottom: 6 }}>{name}</div>
          <div style={{ fontSize: 28, color: '#C7E3FF', marginBottom: 24 }}>{role}</div>
          {tag && <div style={{ fontSize: 22, color: '#fff', opacity: 0.85 }}>{tag}</div>}
        </div>
      </div>
    </div>
  );
};
