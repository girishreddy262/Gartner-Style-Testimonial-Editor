// AWS SigV4 signing utilities for Cloudflare Workers (no AWS SDK — Web Crypto only).
// Two exports:
//   signPresignedUrl({...}) → string  — generates a presigned URL (GET/PUT)
//   sigV4Sign({...}) → Request        — generates a signed Request to send via fetch()

const ENCODER = new TextEncoder();

async function sha256Hex(message) {
  const buf = typeof message === 'string' ? ENCODER.encode(message) : message;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key, message) {
  const keyBuf = typeof key === 'string' ? ENCODER.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, ENCODER.encode(message));
  return new Uint8Array(sig);
}

async function hmacHex(key, message) {
  const sig = await hmac(key, message);
  return [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
}

function amzDate(d = new Date()) {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function uriEncode(str, encodeSlash = true) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  ).replace(encodeSlash ? /__never__/g : /%2F/g, '/');
}

// ── Presigned URL ────────────────────────────────────────────────────────────

export async function signPresignedUrl(env, { method, bucket, region, key, contentType, expiresIn = 3600 }) {
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const { amzDate: amzDateStr, dateStamp } = amzDate();
  const credential = `${env.AWS_ACCESS_KEY_ID}/${dateStamp}/${region}/s3/aws4_request`;

  const signedHeaders = 'host';
  const canonicalQueryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDateStr,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': signedHeaders
  };
  if (contentType && method === 'PUT') {
    // For PUT we let the uploader set Content-Type as a header — don't include in signing
  }

  const sortedKeys = Object.keys(canonicalQueryParams).sort();
  const canonicalQuery = sortedKeys
    .map(k => `${uriEncode(k, false)}=${uriEncode(canonicalQueryParams[k], false)}`)
    .join('&');

  const canonicalUri = '/' + key.split('/').map(p => uriEncode(p, false)).join('/');
  const canonicalHeaders = `host:${host}\n`;

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDateStr,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');

  const kDate = await hmac('AWS4' + env.AWS_SECRET_ACCESS_KEY, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = await hmacHex(kSigning, stringToSign);

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ── Signed fetch request (for List/Delete/etc) ──────────────────────────────

export async function sigV4Sign(env, { method, url, headers = {}, body = '', service, region }) {
  const u = new URL(url);
  const host = u.hostname;
  const { amzDate: amzDateStr, dateStamp } = amzDate();
  const payloadHash = await sha256Hex(body || '');

  const baseHeaders = {
    host,
    'x-amz-date': amzDateStr,
    'x-amz-content-sha256': payloadHash,
    ...headers
  };

  const headerKeys = Object.keys(baseHeaders).map(k => k.toLowerCase()).sort();
  const signedHeaders = headerKeys.join(';');
  const canonicalHeaders = headerKeys
    .map(k => `${k}:${String(baseHeaders[Object.keys(baseHeaders).find(h => h.toLowerCase() === k)]).trim()}`)
    .join('\n') + '\n';

  // Build canonical query string from URL search params
  const sortedParams = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = sortedParams
    .map(([k, v]) => `${uriEncode(k, false)}=${uriEncode(v, false)}`)
    .join('&');

  const canonicalUri = u.pathname.split('/').map(p => uriEncode(p, false)).join('/');

  const canonicalRequest = [
    method,
    canonicalUri || '/',
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDateStr,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');

  const kDate = await hmac('AWS4' + env.AWS_SECRET_ACCESS_KEY, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = await hmacHex(kSigning, stringToSign);

  const authHeader = `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Request(url, {
    method,
    headers: { ...baseHeaders, Authorization: authHeader },
    body: body || undefined
  });
}
