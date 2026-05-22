# Darwinbox Testimonial Callout Editor

Static GitHub Pages editor for placing animated callouts on testimonial videos. Renders MP4s via GitHub Actions + Remotion. Videos stored in Dropbox; everything else in this repo.

## Repo layout

```
.
├── docs/                    ← GitHub Pages source (the editor UI)
│   ├── index.html           List of projects
│   ├── upload.html          New project wizard
│   ├── editor.html          The editor itself
│   ├── js/                  Editor logic + API wrappers
│   ├── css/
│   └── vendor/              Bundled mammoth.js
├── remotion/                ← Render composition
│   ├── src/
│   │   ├── index.ts
│   │   ├── Root.tsx
│   │   ├── TestimonialReel.tsx
│   │   └── scenes/
│   ├── package.json
│   └── tsconfig.json
├── scripts/
│   └── render-worker.mjs    GitHub Action entrypoint
├── .github/workflows/
│   └── render.yml           Triggers on jobs/*.json push
├── jobs/                    ← Per-job state lives here (created at runtime)
│   └── <jobId>.json
└── package.json             Renderer deps
```

## One-time setup

### 1. Create a Dropbox app

1. Go to https://www.dropbox.com/developers/apps
2. Click **Create app**
3. Choose **Scoped access** → **App folder** → name it `TestimonialEditor` (or anything)
4. On the app's settings page:
   - **Permissions** tab → check `files.content.read`, `files.content.write`, `sharing.write` → Submit
   - **Settings** tab → scroll to **OAuth 2** → "Generated access token" → set "No expiration" if available → **Generate**
   - Copy the token (starts with `sl.`)

### 2. Create a fine-grained GitHub PAT

1. Go to https://github.com/settings/tokens?type=beta
2. **Generate new token**
   - Name: `testimonial-editor`
   - Expiration: 90 days
   - Repository access: "Only select repositories" → this repo
   - Permissions:
     - Contents: **Read and write**
     - Workflows: **Read and write**
3. Generate, copy the token (starts with `github_pat_`)

### 3. Add the Dropbox token as a GitHub secret

1. In this repo: Settings → Secrets and variables → Actions
2. **New repository secret**
   - Name: `DROPBOX_TOKEN`
   - Value: the Dropbox token from step 1

### 4. Enable GitHub Pages

1. In this repo: Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: `main` / folder: `/docs`
4. Save. Wait ~30 seconds. Your editor will be live at `https://<your-username>.github.io/<repo-name>/`

### 5. First-run setup in the editor

1. Open the GitHub Pages URL
2. A modal asks for: GitHub owner, repo name, GitHub PAT, Dropbox token
3. Click **Test connection** — both should turn green
4. Click **Save and continue**

You're set up.

## Daily use

1. Open the editor → **+ New project**
2. Drop a testimonial video + the callouts DOCX
3. Wait for upload (video → Dropbox, DOCX → GitHub Release)
4. Editor opens with scenes pre-placed from the DOCX timestamps
5. Edit callout content, swap layouts, adjust timings
6. Click **Approve and render**
7. The GitHub Action picks up within ~10 minutes (or instantly via the push trigger)
8. When status flips to "Done" on the landing page, click **Download**

## Costs

- GitHub Pages: free
- GitHub Actions: 2000 free minutes/month for private repos. Each render ~5-15 min. So ~150 renders/month free.
- GitHub Releases storage: effectively unlimited for our sizes
- Dropbox: depends on your existing plan. Each testimonial uses 500MB-2GB temporarily.

## Limits

- Video files: up to ~5GB tested via Dropbox chunked upload. Larger may hit timeouts.
- Output MP4: up to 2GB (GitHub Release per-file limit). At our default 10 Mbps H.264, that's ~25 minutes of 1080p — plenty.
- Render time: ~3-5x realtime on free Ubuntu runners. A 5-min testimonial takes ~15-25 min to render.

## Troubleshooting

**Editor says "401 Unauthorized"** — PAT expired or wrong scopes. Click Settings, regenerate, paste new token.

**Video won't play in editor** — Dropbox direct link may have expired. The editor calls `refreshVideoUrl` automatically; if that fails, recreate the project.

**Render keeps failing** — Check the Actions tab for logs. Most common: out-of-memory on free runners (large videos), or Dropbox rate limits.

**Created project but it's stuck on "Queued"** — Check that `DROPBOX_TOKEN` is set in repo secrets. Check Actions tab for errors.

## What's NOT in v1

- Editable intro SVG (still uses a generic Darwinbox intro)
- Logo upload visible in intro (planned for v1.1)
- Multi-take video stitching
- Music/SFX overlay
- Captions / subtitles
