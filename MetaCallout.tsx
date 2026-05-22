import React from 'react';

const ICONS: Record<string, React.ReactNode> = {
  industry: <svg viewBox="0 0 24 24" fill="#fff" style={{width:'100%',height:'100%'}}><path d="M14 6h-4V4h4v2zm6 4v9c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2v-9c0-1.1.9-2 2-2h2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v4h2c1.1 0 2 .9 2 2z"/></svg>,
  people: <svg viewBox="0 0 24 24" fill="#fff" style={{width:'100%',height:'100%'}}><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>,
  location: <svg viewBox="0 0 24 24" fill="#fff" style={{width:'100%',height:'100%'}}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
};

interface Props { scene: any; t: number; }

export const MetaCallout: React.FC<Props> = ({ scene, t }) => {
  const local = t - scene.start;
  const dur = scene.end - scene.start;
  let opacity = 1;
  if (local < 0.3) opacity = local / 0.3;
  else if (local > dur - 0.3) opacity = Math.max(0, (dur - local) / 0.3);

  return (
    <div style={{ width: 500, opacity }}>
      <div style={{
        background: 'linear-gradient(143deg, #051A2D 0.9%, #0183FF 107.65%)',
        borderRadius: 20, padding: '40px 48px',
        boxShadow: '0 8px 40px rgba(5, 26, 45, 0.25)',
        fontFamily: 'Inter, sans-serif'
      }}>
        {scene.props.items.map((it: any, i: number) => {
          const visible = t >= (scene.bulletTimings?.[i] || 0);
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 20, padding: '18px 0',
              opacity: visible ? 1 : 0,
              transform: `translateY(${visible ? 0 : 8}px)`,
              transition: 'all 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
              borderTop: i === 0 ? '0' : '1px solid rgba(255,255,255,0.18)'
            }}>
              <div style={{ width: 44, height: 44, flexShrink: 0 }}>{ICONS[it.icon] || ICONS.industry}</div>
              <div style={{ color: '#fff', fontSize: 30, fontWeight: 500 }}>{it.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
