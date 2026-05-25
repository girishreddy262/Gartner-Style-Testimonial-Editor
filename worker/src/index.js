// darwinbox-testimonial-api
// Cloudflare Worker that fronts S3 (storage) + Lambda (renderer) for the testimonial editor.
//
// Endpoints:
//   POST   /api/projects                       Create project, return projectId
//   GET    /api/projects                       List all projects
//   GET    /api/projects/:id                   Fetch one project
//   PUT    /api/projects/:id                   Save project state
//   DELETE /api/projects/:id                   Delete project (S3 + KV)
//   POST   /api/projects/:id/upload-url        Get presigned PUT URL for video
//   POST   /api/projects/:id/asset-upload-url  Get presigned PUT URL for portrait/logo
//   GET    /api/projects/:id/video-url         Get presigned GET URL for video playback in editor
//   POST   /api/projects/:id/render            Invoke Lambda render
//   GET    /api/projects/:id/render-status     Poll render progress
//
// All requests return JSON. CORS is allowed from any origin since auth is "none".

import { signPresignedUrl, sigV4Sign } from './aws.js';
import { invokeLambda } from './lambda.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

function makeProjectId(speakerName) {
  const slug = (speakerName || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 24) || 'project';
  const date = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 5);
  return `${slug}-${date}-${rand}`;
}

const KV_PREFIX = 'testimonial:project:';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // List all projects
      if (path === '/api/projects' && request.method === 'GET') {
        return await listProjects(env);
      }

      // Create new project
      if (path === '/api/projects' && request.method === 'POST') {
        const body = await request.json();
        return await createProject(env, body);
      }

      // Project-scoped routes: /api/projects/:id/...
      const projectMatch = path.match(/^\/api\/projects\/([^/]+)(\/.*)?$/);
      if (projectMatch) {
        const projectId = projectMatch[1];
        const subpath = projectMatch[2] || '';

        if (subpath === '' && request.method === 'GET') {
          return await getProject(env, projectId);
        }
        if (subpath === '' && request.method === 'PUT') {
          const body = await request.json();
          return await updateProject(env, projectId, body);
        }
        if (subpath === '' && request.method === 'DELETE') {
          return await deleteProject(env, projectId);
        }
        if (subpath === '/upload-url' && request.method === 'POST') {
          const body = await request.json();
          return await getVideoUploadUrl(env, projectId, body);
        }
        if (subpath === '/asset-upload-url' && request.method === 'POST') {
          const body = await request.json();
          return await getAssetUploadUrl(env, projectId, body);
        }
        if (subpath === '/video-url' && request.method === 'GET') {
          return await getVideoPlaybackUrl(env, projectId);
        }
        if (subpath === '/render' && request.method === 'POST') {
          return await triggerRender(env, projectId);
        }
        if (subpath === '/render-status' && request.method === 'GET') {
          return await getRenderStatus(env, projectId);
        }
      }

      return error('Not found', 404);
    } catch (e) {
      console.error('Worker error:', e);
      return error(e.message || 'Internal error', 500);
    }
  }
};

// ── Handlers ────────────────────────────────────────────────────────────────

async function listProjects(env) {
  const list = await env.TESTIMONIAL_KV.list({ prefix: KV_PREFIX });
  const projects = [];
  for (const k of list.keys) {
    const data = await env.TESTIMONIAL_KV.get(k.name, 'json');
    if (data) projects.push(data);
  }
  projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return json({ projects });
}

async function createProject(env, body) {
  const speakerName = body?.speaker?.name || body?.name || 'project';
  const projectId = makeProjectId(speakerName);
  const now = new Date().toISOString();
  const project = {
    projectId,
    createdAt: now,
    updatedAt: now,
    status: 'editing',
    ...body
  };
  await env.TESTIMONIAL_KV.put(KV_PREFIX + projectId, JSON.stringify(project));
  return json({ project });
}

async function getProject(env, projectId) {
  const data = await env.TESTIMONIAL_KV.get(KV_PREFIX + projectId, 'json');
  if (!data) return error('Project not found', 404);
  return json({ project: data });
}

async function updateProject(env, projectId, patch) {
  const existing = await env.TESTIMONIAL_KV.get(KV_PREFIX + projectId, 'json');
  if (!existing) return error('Project not found', 404);
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await env.TESTIMONIAL_KV.put(KV_PREFIX + projectId, JSON.stringify(updated));
  return json({ project: updated });
}

async function deleteProject(env, projectId) {
  const existing = await env.TESTIMONIAL_KV.get(KV_PREFIX + projectId, 'json');
  if (!existing) return error('Project not found', 404);

  // Best-effort delete S3 objects under this projectId
  const prefix = `testimonials/${projectId}/`;
  try {
    await deleteS3Prefix(env, prefix);
  } catch (e) {
    console.warn('S3 cleanup failed:', e.message);
  }

  await env.TESTIMONIAL_KV.delete(KV_PREFIX + projectId);
  return json({ deleted: true });
}

async function getVideoUploadUrl(env, projectId, body) {
  const fileName = body?.fileName || 'video.mp4';
  const contentType = body?.contentType || 'video/mp4';
  const key = `testimonials/${projectId}/${fileName}`;
  const url = await signPresignedUrl(env, {
    method: 'PUT',
    bucket: env.S3_BUCKET,
    region: env.AWS_REGION,
    key,
    contentType,
    expiresIn: 3600
  });
  return json({ uploadUrl: url, s3Key: key });
}

async function getAssetUploadUrl(env, projectId, body) {
  // For portraits, logos, etc. — under testimonials/<id>/assets/
  const fileName = body?.fileName;
  const contentType = body?.contentType || 'image/png';
  if (!fileName) return error('fileName required');
  const key = `testimonials/${projectId}/assets/${fileName}`;
  const url = await signPresignedUrl(env, {
    method: 'PUT',
    bucket: env.S3_BUCKET,
    region: env.AWS_REGION,
    key,
    contentType,
    expiresIn: 3600
  });
  return json({ uploadUrl: url, s3Key: key, publicUrl: s3PublicUrl(env, key) });
}

async function getVideoPlaybackUrl(env, projectId) {
  // Returns a presigned GET URL the browser can stream from
  const data = await env.TESTIMONIAL_KV.get(KV_PREFIX + projectId, 'json');
  if (!data) return error('Project not found', 404);
  if (!data.s3VideoKey) return error('No video uploaded yet', 404);
  const url = await signPresignedUrl(env, {
    method: 'GET',
    bucket: env.S3_BUCKET,
    region: env.AWS_REGION,
    key: data.s3VideoKey,
    expiresIn: 21600  // 6 hours
  });
  return json({ videoUrl: url });
}

async function triggerRender(env, projectId) {
  const project = await env.TESTIMONIAL_KV.get(KV_PREFIX + projectId, 'json');
  if (!project) return error('Project not found', 404);
  if (!project.s3VideoKey) return error('No video uploaded', 400);

  // Build a presigned GET URL for the input video — Lambda will fetch this
  const videoUrl = await signPresignedUrl(env, {
    method: 'GET',
    bucket: env.S3_BUCKET,
    region: env.AWS_REGION,
    key: project.s3VideoKey,
    expiresIn: 21600
  });

  // Invoke Lambda. Remotion Lambda expects a specific payload shape.
  const inputProps = { ...project, videoUrl };
  const totalDurationSec = Math.max(10, Math.ceil(project.totalDuration || 30));
  const durationInFrames = totalDurationSec * 30;  // 30fps

  const outputKey = `testimonials/${projectId}/output.mp4`;

  const payload = {
    type: 'start',
    serveUrl: env.REMOTION_SERVE_URL,
    composition: 'TestimonialReel',
    inputProps,
    framesPerLambda: 60,
    codec: 'h264',
    imageFormat: 'jpeg',
    crf: 22,
    pixelFormat: 'yuv420p',
    privacy: 'public',
    outName: {
      bucketName: env.S3_BUCKET,
      key: outputKey,
      s3OutputProvider: {
        endpoint: `https://s3.${env.AWS_REGION}.amazonaws.com`
      }
    }
  };

  const result = await invokeLambda(env, payload);

  // Save the renderId so we can poll
  const updated = {
    ...project,
    status: 'rendering',
    render: {
      renderId: result.renderId,
      bucketName: result.bucketName,
      startedAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  };
  await env.TESTIMONIAL_KV.put(KV_PREFIX + projectId, JSON.stringify(updated));

  return json({ status: 'rendering', renderId: result.renderId });
}

async function getRenderStatus(env, projectId) {
  const project = await env.TESTIMONIAL_KV.get(KV_PREFIX + projectId, 'json');
  if (!project) return error('Project not found', 404);
  if (!project.render || !project.render.renderId) {
    return json({ status: project.status || 'editing' });
  }

  const payload = {
    type: 'status',
    renderId: project.render.renderId,
    bucketName: project.render.bucketName
  };
  const result = await invokeLambda(env, payload);

  // Remotion progress responses include: done, encodingStatus, errors, outputFile, etc.
  if (result.fatalErrorEncountered) {
    const updated = {
      ...project,
      status: 'failed',
      render: { ...project.render, error: result.errors?.[0]?.message || 'Render failed' },
      updatedAt: new Date().toISOString()
    };
    await env.TESTIMONIAL_KV.put(KV_PREFIX + projectId, JSON.stringify(updated));
    return json({ status: 'failed', error: updated.render.error });
  }

  if (result.done) {
    // outputFile is an S3 path; build a presigned GET URL the user can download
    const outputKey = `testimonials/${projectId}/output.mp4`;
    const downloadUrl = await signPresignedUrl(env, {
      method: 'GET',
      bucket: env.S3_BUCKET,
      region: env.AWS_REGION,
      key: outputKey,
      expiresIn: 604800  // 7 days
    });
    const updated = {
      ...project,
      status: 'complete',
      render: {
        ...project.render,
        completedAt: new Date().toISOString(),
        mp4Url: downloadUrl,
        outputKey
      },
      updatedAt: new Date().toISOString()
    };
    await env.TESTIMONIAL_KV.put(KV_PREFIX + projectId, JSON.stringify(updated));
    return json({ status: 'complete', mp4Url: downloadUrl });
  }

  // In-progress: return progress info
  return json({
    status: 'rendering',
    progress: result.overallProgress,
    framesRendered: result.framesRendered,
    encodingProgress: result.encodingStatus?.progress
  });
}

// ── S3 helpers ──────────────────────────────────────────────────────────────

function s3PublicUrl(env, key) {
  return `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}

async function deleteS3Prefix(env, prefix) {
  // List objects under prefix, then DELETE each one.
  // Using ListObjectsV2 (signed GET) → DeleteObject (signed DELETE).
  const listUrl = `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/?list-type=2&prefix=${encodeURIComponent(prefix)}`;
  const listReq = await sigV4Sign(env, {
    method: 'GET',
    url: listUrl,
    headers: {},
    service: 's3',
    region: env.AWS_REGION
  });
  const listRes = await fetch(listReq);
  if (!listRes.ok) throw new Error(`List failed: ${listRes.status}`);
  const xml = await listRes.text();
  // Very simple XML key extraction
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
  for (const key of keys) {
    const delUrl = `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
    const delReq = await sigV4Sign(env, {
      method: 'DELETE',
      url: delUrl,
      headers: {},
      service: 's3',
      region: env.AWS_REGION
    });
    await fetch(delReq);
  }
}
