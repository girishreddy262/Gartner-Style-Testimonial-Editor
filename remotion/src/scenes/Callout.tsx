import React from 'react';
import { ICONS, getIconSvg, getMetaIconDataUrl } from '../lib/icons';
import { itemReveal, cardLifecycle } from '../lib/animation';

// ============================================================
// CALLOUT — renders all 11 layouts matching the editor pixel-perfectly.
// ============================================================
//
// Position on canvas: left: 90px, vertically centered (top: 50%, translateY -50%).
// Width: 500px, max-height: 960px (canvas - 120px padding).
// Card scales as one unit, 700ms cubic-bezier ease.
// Each item fades in at its `time` value, with 600ms cubic ease.

interface CalloutProps {
  callout: any;     // The full callout object from editor state
  t: number;        // Current time in seconds
}

const CARD_WIDTH = 500;
const CARD_MAX_HEIGHT = 960;

// Card outer wrapper — handles entrance / exit / position
export const Callout: React.FC<CalloutProps> = ({ callout, t }) => {
  const { opacity, scale } = cardLifecycle(callout.start, callout.end, t);
  if (opacity === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 90,
        top: '50%',
        width: CARD_WIDTH,
        maxHeight: CARD_MAX_HEIGHT,
        borderRadius: 20,
        overflow: 'hidden',
        border: '2px solid #C7E3FF',
        opacity,
        transform: `translateY(-50%) scale(${scale})`,
        transformOrigin: 'top left',
        boxShadow: '0 12px 48px rgba(15, 23, 42, 0.18)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {renderLayout(callout, t)}
    </div>
  );
};

// ---- Helper: inline-bold rendering (**word** → bold span) ----
function renderInlineBold(text: string): React.ReactNode[] {
  if (!text) return [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const word = part.slice(2, -2);
      return (
        <b
          key={i}
          style={{
            fontSize: 40,
            fontWeight: 900,
            color: '#002B54',
            display: 'inline-block',
          }}
        >
          {word}
        </b>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

// ---- Per-item reveal wrapper — fades + slides + grows ----
const ItemReveal: React.FC<{
  itemTime: number | undefined;
  startFallback: number;
  t: number;
  children: React.ReactNode;
  marginTop?: number;
}> = ({ itemTime, startFallback, t, children, marginTop = 0 }) => {
  const target = itemTime != null ? itemTime : startFallback;
  const p = itemReveal(target, t, 0.6);
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${(1 - p) * 6}px)`,
        maxHeight: p > 0 ? 800 : 0,
        marginTop: p > 0 ? marginTop : 0,
        overflow: 'hidden',
        transition: 'none', // no CSS transition; Remotion drives every frame
      }}
    >
      {children}
    </div>
  );
};

// ---- Shared style fragments ----
const navyGradient = 'linear-gradient(143deg, #051A2D 0.9%, #0183FF 107.65%)';
const titleBarStyle: React.CSSProperties = {
  background: navyGradient,
  color: '#fff',
  padding: '36px 36px',
  fontSize: 40,
  fontWeight: 700,
  lineHeight: 1.2,
};
const bodyCardStyle: React.CSSProperties = {
  background: '#fff',
  padding: '36px 36px 64px 36px',
  color: '#002B54',
  display: 'flex',
  flexDirection: 'column',
};
const bulletRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'flex-start',
  fontSize: 32,
  fontWeight: 500,
  lineHeight: '40px',
  color: '#002B54',
};
const bulletMarkerStyle: React.CSSProperties = {
  width: 28,
  flexShrink: 0,
  color: '#0183FF',
  fontSize: 32,
  fontWeight: 700,
  lineHeight: '40px',
};

// ============================================================
// Layout dispatcher
// ============================================================
function renderLayout(c: any, t: number): React.ReactNode {
  const items = c.items || [];
  const content = c.content || {};

  switch (c.layout) {
    case 'meta_intro':
      return renderMetaIntro(items, c, t);
    case 'bullets_with_inline_metric':
      return renderBulletsInline(content, items, c, t);
    case 'bullets_with_icons':
      return renderBulletsWithIcons(items, c, t);
    case 'dual_section_bullets':
      return renderDualSection(content, items, c, t);
    case 'tagpill_metric_before_after':
      return renderTagPill(items, c, t);
    case 'time_comparison':
      return renderTimeComparison(content, items, c, t);
    case 'simple_metric':
      return renderSimpleMetric(content, items, c, t);
    case 'metric_with_subtext':
      return renderMetricWithSubtext(items, c, t);
    case 'icon_count':
      return renderIconCount(items, c, t);
    case 'title_only_dark':
      return renderTitleOnly(items, c, t);
    case 'country_bullets':
      return renderCountryBullets(content, items, c, t);
    default:
      return (
        <div style={{ padding: 24, background: '#fff', color: '#FC6A6B' }}>
          Unsupported layout: {c.layout}
        </div>
      );
  }
}

// ============================================================
// LAYOUTS
// ============================================================

// meta_intro — rows of icon-badge + text (industry / employees / location)
function renderMetaIntro(items: any[], c: any, t: number): React.ReactNode {
  return (
    <div
      style={{
        background: '#fff',
        padding: '48px 36px 64px',
        color: '#002B54',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {items.map((it: any, i: number) => (
        <ItemReveal
          key={i}
          itemTime={it.time}
          startFallback={c.start}
          t={t}
          marginTop={i === 0 ? 0 : 24}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                background: '#0183FF',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Icon as a masked div — keeps blue background, renders icon as white */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  background: '#fff',
                  WebkitMaskImage: `url('${getMetaIconDataUrl(it.iconKind)}')`,
                  maskImage: `url('${getMetaIconDataUrl(it.iconKind)}')`,
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                }}
              />
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.2 }}>
              {it.text || ''}
            </div>
          </div>
        </ItemReveal>
      ))}
    </div>
  );
}

// bullets_with_inline_metric — navy title bar + bullets with optional bold metric
function renderBulletsInline(
  content: any,
  items: any[],
  c: any,
  t: number
): React.ReactNode {
  return (
    <>
      <div style={titleBarStyle}>{content.title || ''}</div>
      <div style={bodyCardStyle}>
        {items.map((it: any, i: number) => {
          const raw =
            (it.text || '') + (it.bold ? ' **' + it.bold + '**' : '');
          return (
            <ItemReveal
              key={i}
              itemTime={it.time}
              startFallback={c.start}
              t={t}
              marginTop={i === 0 ? 0 : 22}
            >
              <div style={bulletRowStyle}>
                <span style={bulletMarkerStyle}>→</span>
                <span style={{ flex: 1 }}>{renderInlineBold(raw)}</span>
              </div>
            </ItemReveal>
          );
        })}
      </div>
    </>
  );
}

// bullets_with_icons — each bullet has its own icon badge
function renderBulletsWithIcons(
  items: any[],
  c: any,
  t: number
): React.ReactNode {
  return (
    <div style={{ ...bodyCardStyle, padding: '48px 36px 64px 36px' }}>
      {items.map((it: any, i: number) => (
        <ItemReveal
          key={i}
          itemTime={it.time}
          startFallback={c.start}
          t={t}
          marginTop={i === 0 ? 0 : 28}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 12,
                background: navyGradient,
                padding: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              dangerouslySetInnerHTML={{
                __html: getIconSvg(it.icon).replace(
                  '<svg ',
                  '<svg fill="#fff" style="width:100%;height:100%" '
                ),
              }}
            />
            <div
              style={{
                fontSize: 28,
                fontWeight: 500,
                lineHeight: 1.3,
                color: '#002B54',
              }}
            >
              {it.text || ''}
            </div>
          </div>
        </ItemReveal>
      ))}
    </div>
  );
}

// dual_section_bullets — sections with sub-bullets
function renderDualSection(
  content: any,
  items: any[],
  c: any,
  t: number
): React.ReactNode {
  return (
    <>
      <div style={titleBarStyle}>{content.title || ''}</div>
      <div style={{ ...bodyCardStyle, padding: '36px 36px 64px 36px' }}>
        {items.map((it: any, i: number) => (
          <ItemReveal
            key={i}
            itemTime={it.time}
            startFallback={c.start}
            t={t}
            marginTop={i === 0 ? 0 : 18}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    color: '#0183FF',
                    fontSize: 28,
                    fontWeight: 900,
                  }}
                >
                  →
                </span>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: '#002B54',
                  }}
                >
                  {it.heading || ''}
                </div>
              </div>
              {(it.subs || []).map((s: string, j: number) => (
                <div
                  key={j}
                  style={{
                    display: 'flex',
                    gap: 12,
                    fontSize: 24,
                    color: '#002B54',
                    marginBottom: 8,
                    marginLeft: 36,
                  }}
                >
                  <span style={{ color: '#0183FF' }}>·</span>
                  {s}
                </div>
              ))}
            </div>
          </ItemReveal>
        ))}
      </div>
    </>
  );
}

// tagpill_metric_before_after — pill + numbers + big metric + caption (per item)
function renderTagPill(items: any[], c: any, t: number): React.ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((it: any, i: number) => (
        <ItemReveal
          key={i}
          itemTime={it.time}
          startFallback={c.start}
          t={t}
          marginTop={i === 0 ? 0 : 8}
        >
          <div>
            <div
              style={{
                background: navyGradient,
                color: '#fff',
                padding: 36,
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  background: '#0183FF',
                  padding: '8px 20px',
                  borderRadius: 6,
                  fontSize: 24,
                  fontWeight: 700,
                  alignSelf: 'flex-start',
                }}
              >
                {it.pill || ''}
              </div>
              <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.2 }}>
                {it.numbers || ''}
              </div>
            </div>
            <div style={bodyCardStyle}>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 900,
                  color: '#002B54',
                  lineHeight: 1.1,
                }}
              >
                {it.metric || ''}
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: '#002B54',
                  marginTop: 12,
                  fontWeight: 500,
                }}
              >
                {it.caption || ''}
              </div>
            </div>
          </div>
        </ItemReveal>
      ))}
    </div>
  );
}

// time_comparison — from → to (numbers in a row)
function renderTimeComparison(
  content: any,
  items: any[],
  c: any,
  t: number
): React.ReactNode {
  return (
    <>
      <div style={titleBarStyle}>{content.title || ''}</div>
      <div
        style={{
          ...bodyCardStyle,
          padding: '60px 36px 64px 36px',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {items.map((it: any, i: number) => (
          <ItemReveal
            key={i}
            itemTime={it.time}
            startFallback={c.start}
            t={t}
            marginTop={0}
          >
            <div
              style={{
                display: 'flex',
                gap: 32,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 80,
                    fontWeight: 900,
                    color: '#002B54',
                    lineHeight: 1,
                  }}
                >
                  {it.from_num || ''}
                </div>
                <div
                  style={{ fontSize: 24, color: '#6b7280', marginTop: 8 }}
                >
                  {it.from_unit || ''}
                </div>
              </div>
              <div
                style={{
                  fontSize: 48,
                  color: '#0183FF',
                  fontWeight: 900,
                }}
              >
                »
              </div>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 80,
                    fontWeight: 900,
                    color: '#0183FF',
                    lineHeight: 1,
                  }}
                >
                  {it.to_num || ''}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    color: '#002B54',
                    marginTop: 8,
                    fontWeight: 600,
                  }}
                >
                  {it.to_unit || ''}
                </div>
              </div>
            </div>
          </ItemReveal>
        ))}
      </div>
    </>
  );
}

// simple_metric — title bar + big metric + caption (per item)
function renderSimpleMetric(
  content: any,
  items: any[],
  c: any,
  t: number
): React.ReactNode {
  return (
    <>
      <div style={titleBarStyle}>{content.title || ''}</div>
      <div style={{ ...bodyCardStyle, padding: '48px 36px 64px 36px' }}>
        {items.map((it: any, i: number) => (
          <ItemReveal
            key={i}
            itemTime={it.time}
            startFallback={c.start}
            t={t}
            marginTop={i === 0 ? 0 : 16}
          >
            <div>
              <div
                style={{
                  fontSize: 96,
                  fontWeight: 900,
                  color: '#002B54',
                  lineHeight: 1,
                }}
              >
                {it.metric || ''}
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: '#002B54',
                  marginTop: 12,
                  fontWeight: 500,
                }}
              >
                {it.caption || ''}
              </div>
            </div>
          </ItemReveal>
        ))}
      </div>
    </>
  );
}

// metric_with_subtext — blue metric + label + caption (no title bar, no border on top)
function renderMetricWithSubtext(
  items: any[],
  c: any,
  t: number
): React.ReactNode {
  return (
    <div style={{ ...bodyCardStyle, padding: '56px 36px 64px 36px' }}>
      {items.map((it: any, i: number) => (
        <ItemReveal
          key={i}
          itemTime={it.time}
          startFallback={c.start}
          t={t}
          marginTop={i === 0 ? 0 : 20}
        >
          <div>
            <div
              style={{
                fontSize: 96,
                fontWeight: 900,
                color: '#0183FF',
                lineHeight: 1,
              }}
            >
              {it.metric || ''}
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 900,
                color: '#002B54',
                marginTop: 12,
              }}
            >
              {it.label || ''}
            </div>
            <div
              style={{
                fontSize: 24,
                color: '#002B54',
                marginTop: 8,
              }}
            >
              {it.caption || ''}
            </div>
          </div>
        </ItemReveal>
      ))}
    </div>
  );
}

// icon_count — icon badge + count + caption
function renderIconCount(items: any[], c: any, t: number): React.ReactNode {
  return (
    <div style={{ ...bodyCardStyle, padding: '48px 36px 64px 36px' }}>
      {items.map((it: any, i: number) => (
        <ItemReveal
          key={i}
          itemTime={it.time}
          startFallback={c.start}
          t={t}
          marginTop={i === 0 ? 0 : 24}
        >
          <div>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 12,
                background: navyGradient,
                padding: 18,
                marginBottom: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              dangerouslySetInnerHTML={{
                __html: getIconSvg(it.icon).replace(
                  '<svg ',
                  '<svg fill="#fff" style="width:100%;height:100%" '
                ),
              }}
            />
            <div
              style={{
                fontSize: 80,
                fontWeight: 900,
                color: '#002B54',
                lineHeight: 1,
              }}
            >
              {it.count || ''}
            </div>
            <div
              style={{
                fontSize: 28,
                color: '#002B54',
                marginTop: 12,
                fontWeight: 500,
              }}
            >
              {it.caption || ''}
            </div>
          </div>
        </ItemReveal>
      ))}
    </div>
  );
}

// title_only_dark — navy bg, icon badge + big title (stacks vertically when multiple)
function renderTitleOnly(items: any[], c: any, t: number): React.ReactNode {
  return (
    <div
      style={{
        background: navyGradient,
        padding: '48px 36px 64px 36px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {items.map((it: any, i: number) => (
        <ItemReveal
          key={i}
          itemTime={it.time}
          startFallback={c.start}
          t={t}
          marginTop={i === 0 ? 0 : 32}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.15)',
                padding: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              dangerouslySetInnerHTML={{
                __html: getIconSvg(it.icon).replace(
                  '<svg ',
                  '<svg fill="#fff" style="width:100%;height:100%" '
                ),
              }}
            />
            <div
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: '#fff',
                lineHeight: 1.2,
              }}
            >
              {it.title || ''}
            </div>
          </div>
        </ItemReveal>
      ))}
    </div>
  );
}

// country_bullets — title + flag/country row + bullets
function renderCountryBullets(
  content: any,
  items: any[],
  c: any,
  t: number
): React.ReactNode {
  return (
    <>
      <div style={titleBarStyle}>{content.title || ''}</div>
      <div style={bodyCardStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 40 }}>{content.flag || ''}</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#002B54' }}>
            {content.country || ''}
          </div>
        </div>
        {items.map((it: any, i: number) => {
          const raw =
            (it.text || '') + (it.bold ? ' **' + it.bold + '**' : '');
          return (
            <ItemReveal
              key={i}
              itemTime={it.time}
              startFallback={c.start}
              t={t}
              marginTop={i === 0 ? 0 : 22}
            >
              <div style={bulletRowStyle}>
                <span style={bulletMarkerStyle}>→</span>
                <span style={{ flex: 1 }}>{renderInlineBold(raw)}</span>
              </div>
            </ItemReveal>
          );
        })}
      </div>
    </>
  );
}
