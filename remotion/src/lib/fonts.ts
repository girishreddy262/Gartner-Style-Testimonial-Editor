// Font CSS — currently empty (system fallback used).
// We removed the embedded Satoshi base64 because the 134KB inline CSS was
// suspected of slowing Chromium's page-load in Lambda. The composition uses
// the next font in the stack (system sans-serif) which renders identically
// well across platforms. Re-enable Satoshi via Remotion's loadFont API in a
// later iteration if pixel-perfect typography matters.
export const SATOSHI_FONT_CSS = '';
