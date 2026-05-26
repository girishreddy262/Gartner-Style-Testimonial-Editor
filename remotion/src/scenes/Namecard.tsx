import React from 'react';
import { itemReveal } from '../lib/animation';

// ============================================================
// NAMECARD — overlays the video on the right, showing speaker name + role.
// ============================================================
//
// Position (from editor): right: 130px, bottom: 320px.
// Fades in over 300ms when state.namecard.start <= t < state.namecard.end.
// Hidden during intro.

interface NamecardProps {
  name: string;
  role: string;
  start: number;
  end: number;
  t: number;
}

export const Namecard: React.FC<NamecardProps> = ({
  name,
  role,
  start,
  end,
  t,
}) => {
  if (t < start - 0.3 || t > end + 0.3) return null;

  // Fade in over 300ms at start, fade out over 300ms before end
  let opacity = 1;
  if (t < start) opacity = itemReveal(start - 0.3, t, 0.3);
  else if (t > end - 0.3) opacity = 1 - itemReveal(end - 0.3, t, 0.3);

  return (
    <div
      style={{
        position: 'absolute',
        right: 130,
        bottom: 320,
        background: 'rgba(100, 116, 139, 0.85)',
        color: '#fff',
        padding: '14px 28px',
        borderRadius: 6,
        textAlign: 'right',
        opacity,
        zIndex: 5,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.15 }}>
        {name}
      </div>
      <div style={{ fontSize: 16, opacity: 0.85, marginTop: 4 }}>{role}</div>
    </div>
  );
};
