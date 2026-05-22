import React from 'react';

const ICONS: Record<string, React.ReactNode> = {
  industry: <svg viewBox="0 0 24 24" fill="#fff" style={{width:'100%',height:'100%'}}><path d="M14 6h-4V4h4v2zm6 4v9c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2v-9c0-1.1.9-2 2-2h2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v4h2c1.1 0 2 .9 2 2z"/></svg>,
  people: <svg viewBox="0 0 24 24" fill="#fff" style={{width:'100%',height:'100%'}}><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>,
  location: <svg viewBox="0 0 24 24" fill="#fff" style={{width:'100%',height:'100%'}}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
};

const navy = {
  background: 'linear-gradient(143deg, #051A2D 0.9%, #0183FF 107.65%)',
  borderRadius: '20px 20px 0 0',
  padding: '40px 44px',
  color: '#fff',
  fontFamily: 'Inter, sans-serif'
} as React.CSSProperties;

const navyFull = { ...navy, borderRadius: 20 } as React.CSSProperties;

const whitePanel = {
  background: '#fff',
  border: '2px solid #C7E3FF',
  borderTop: 0,
  borderRadius: '0 0 20px 20px',
  padding: '36px 44px 56px',
  color: '#002B54',
  overflow: 'hidden',
  fontFamily: 'Inter, sans-serif'
} as React.CSSProperties;

const whitePanelFull = {
  background: '#fff',
  border: '2px solid #C7E3FF',
  borderRadius: 20,
  padding: 44,
  color: '#002B54',
  fontFamily: 'Inter, sans-serif'
} as React.CSSProperties;

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

const fade = (t: number, dur: number) => {
  let o = 1;
  if (t < 0.3) o = t / 0.3;
  else if (t > dur - 0.3) o = Math.max(0, (dur - t) / 0.3);
  return o;
};

interface Props { scene: any; t: number; }

export const ContentCallout: React.FC<Props> = ({ scene, t }) => {
  const local = t - scene.start;
  const dur = scene.end - scene.start;
  const opacity = fade(local, dur);
  const p = scene.props;
  const l = scene.layout;

  return (
    <div style={{ width: 500, opacity }}>
      {renderLayout(l, p, scene, t)}
    </div>
  );
};

function renderLayout(l: string, p: any, scene: any, t: number) {
  if (l === 'bullets_with_inline_metric') {
    const visibleBullets = (scene.bulletTimings || []).map((tm: number, i: number) => t >= tm ? i : -1).filter((x: number) => x >= 0);
    const bullets = (p.bullets || []).map((b: any, i: number) => {
      const vis = visibleBullets.includes(i);
      return (
        <div key={i} style={{
          display: 'flex', gap: 14, alignItems: 'flex-start',
          opacity: vis ? 1 : 0,
          transform: `translateY(${vis ? 0 : 10}px)`,
          transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)',
          marginBottom: 16
        }}>
          <span style={{ color: '#0183FF', fontSize: 28, fontWeight: 900, lineHeight: 1.25, flexShrink: 0 }}>→</span>
          <span style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.3, color: '#002B54' }}>{b.text}</span>
        </div>
      );
    });
    return (
      <>
        <div style={navy}><div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.2 }}>{p.title}</div></div>
        <div style={whitePanel}>{bullets}</div>
      </>
    );
  }
  if (l === 'bullets_with_icons') {
    return (
      <div style={whitePanelFull}>
        {(p.bullets || []).map((b: any, i: number) => {
          const vis = t >= (scene.bulletTimings?.[i] || 0);
          return (
            <div key={i} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              opacity: vis ? 1 : 0, transition: 'opacity 0.4s', marginBottom: 14
            }}>
              <div style={{
                width: 48, height: 48, background: 'linear-gradient(135deg, #0183FF, #003B73)',
                borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, padding: 10
              }}>{ICONS.industry}</div>
              <span style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.3, color: '#002B54', paddingTop: 4 }}>{b.text}</span>
            </div>
          );
        })}
      </div>
    );
  }
  if (l === 'simple_metric') {
    return (
      <>
        <div style={navy}><div style={{ fontSize: 36, fontWeight: 700 }}>{p.title}</div></div>
        <div style={whitePanel}>
          <div style={{ fontSize: 92, fontWeight: 900, color: '#002B54', lineHeight: 1 }}>{p.metric}</div>
          <div style={{ fontSize: 24, color: '#002B54', marginTop: 12, fontWeight: 500 }}>{p.caption}</div>
        </div>
      </>
    );
  }
  if (l === 'tagpill_metric_before_after') {
    return (
      <>
        <div style={navy}>
          <div style={{
            display: 'inline-block', background: '#0183FF', padding: '8px 16px',
            borderRadius: 6, fontSize: 20, fontWeight: 700, marginBottom: 16
          }}>{p.tag}</div>
          <div style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.15 }}>{p.before} → {p.after}</div>
        </div>
        <div style={whitePanel}>
          <div style={{ fontSize: 52, fontWeight: 900, color: '#002B54', lineHeight: 1.1 }}>{p.metric}</div>
          <div style={{ fontSize: 22, color: '#002B54', marginTop: 8, fontWeight: 500 }}>{p.caption}</div>
        </div>
      </>
    );
  }
  if (l === 'metric_with_subtext') {
    return (
      <div style={{ ...whitePanelFull, borderTop: '2px solid #C7E3FF' }}>
        <div style={{ fontSize: 88, fontWeight: 900, color: '#0183FF', lineHeight: 1 }}>{p.metric}</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: '#002B54', marginTop: 8 }}>{p.label}</div>
        <div style={{ fontSize: 22, color: '#002B54', marginTop: 8 }}>{p.caption}</div>
      </div>
    );
  }
  if (l === 'icon_count') {
    return (
      <div style={whitePanelFull}>
        <div style={{
          width: 80, height: 80, background: 'linear-gradient(135deg, #0183FF, #003B73)',
          borderRadius: 16, padding: 18, marginBottom: 18
        }}>{ICONS.people}</div>
        <div style={{ fontSize: 74, fontWeight: 900, color: '#002B54', lineHeight: 1 }}>{p.count}</div>
        <div style={{ fontSize: 24, color: '#002B54', marginTop: 8, fontWeight: 500 }}>{p.label}</div>
      </div>
    );
  }
  if (l === 'time_comparison') {
    return (
      <>
        <div style={navy}><div style={{ fontSize: 36, fontWeight: 700 }}>{p.title}</div></div>
        <div style={whitePanel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 64, fontWeight: 900, color: '#002B54', lineHeight: 1 }}>{p.beforeValue}</div>
              <div style={{ fontSize: 20, color: '#6b7280', marginTop: 4 }}>{p.beforeUnit}</div>
            </div>
            <div style={{ fontSize: 36, color: '#0183FF', fontWeight: 900 }}>»</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 64, fontWeight: 900, color: '#0183FF', lineHeight: 1 }}>{p.afterValue}</div>
              <div style={{ fontSize: 20, color: '#002B54', marginTop: 4, fontWeight: 600 }}>{p.afterUnit}</div>
            </div>
          </div>
        </div>
      </>
    );
  }
  if (l === 'title_only_dark') {
    return <div style={navyFull}><div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.2 }}>{p.title}</div></div>;
  }
  if (l === 'country_bullets') {
    return (
      <>
        <div style={navy}><div style={{ fontSize: 32, fontWeight: 700 }}>🌐 {p.country}</div></div>
        <div style={whitePanel}>
          {(p.bullets || []).map((b: any, i: number) => {
            const vis = t >= (scene.bulletTimings?.[i] || 0);
            return (
              <div key={i} style={{
                display: 'flex', gap: 14, alignItems: 'flex-start',
                opacity: vis ? 1 : 0, transition: 'opacity 0.4s', marginBottom: 14
              }}>
                <span style={{ color: '#0183FF', fontSize: 24, fontWeight: 900 }}>→</span>
                <span style={{ fontSize: 22, fontWeight: 500, color: '#002B54' }}>{b.text}</span>
              </div>
            );
          })}
        </div>
      </>
    );
  }
  if (l === 'dual_section_bullets') {
    return (
      <>
        <div style={navy}><div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.2 }}>{p.title}</div></div>
        <div style={whitePanel}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: '#0183FF', fontSize: 22, fontWeight: 900 }}>→</span>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#002B54' }}>{p.sectionAName || 'Section A'}</div>
            </div>
            {(p.sectionA || []).map((b: string, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 20, color: '#002B54', marginBottom: 6 }}>
                <span style={{ color: '#0183FF' }}>·</span>{b}
              </div>
            ))}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: '#0183FF', fontSize: 22, fontWeight: 900 }}>→</span>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#002B54' }}>{p.sectionBName || 'Section B'}</div>
            </div>
            {(p.sectionB || []).map((b: string, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 20, color: '#002B54', marginBottom: 6 }}>
                <span style={{ color: '#0183FF' }}>·</span>{b}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }
  return <div style={whitePanelFull}><div style={{ color: '#6b7280' }}>Unsupported layout: {l}</div></div>;
}
