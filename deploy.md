# Testimonial Editor v2 — Deploy Guide

Architecture: Cloudflare Worker (auth/coordination) → AWS S3 (storage) → AWS Lambda (Remotion render). Editor served from GitHub Pages.

## What's in this folder

```
.
├── docs/                       GitHub Pages source (the editor UI)
│   ├── index.html, upload.html, editor.html
│   ├── js/api.js              Single API client (replaces auth/dropbox/github modules)
│   ├── js/parser.js, editor.js
│   ├── css/, vendor/
├── remotion/                   Render composition (deployed to Lambda)
│   └── src/
├── worker/                     Cloudflare Worker source
│   ├── src/index.js, aws.js, lambda.js
│   ├── package.json, wrangler.toml
└── deploy.md                   This file
```

## Prereqs (do once)

You already have:
- ✓ AWS Remotion Lambda function in `ap-south-1`
- ✓ Cloudflare account
- ✓ GitHub Pages repo (`Gartner-Style-Testimonial-Editor`)

You'll create in this guide:
- New S3 bucket: `darwinbox-gartner-testimonial-editor`
- New IAM user: `testimonial-editor-worker`
- New KV namespace: `TESTIMONIAL_KV`
- New Cloudflare Worker: `darwinbox-testimonial-api`

---

## Step 1 — Create the S3 bucket

1. AWS Console → S3 → Create bucket
2. Bucket name: **`darwinbox-gartner-testimonial-editor`**
3. AWS Region: **Asia Pacific (Mumbai) ap-south-1**
4. Object Ownership: ACLs disabled (default)
5. Block Public Access: keep all 4 boxes checked
6. Versioning: Disabled
7. Encryption: SSE-S3 (default)
8. Create

After creation, on the bucket → Permissions tab → **CORS** → Edit, paste:

```json
[
  {
    "AllowedOrigins": ["https://girishreddy262.github.io"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Save.

---

## Step 2 — Create the IAM user

1. AWS Console → IAM → Users → **Create user**
2. User name: `testimonial-editor-worker`
3. Do NOT check "Provide user access to the AWS Management Console"
4. Next → on the Permissions step, just click Next (we'll add an inline policy after)
5. Create user

Then on the user's page:

1. **Permissions** tab → Add permissions → **Create inline policy** → JSON tab
2. Paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::darwinbox-gartner-testimonial-editor",
        "arn:aws:s3:::darwinbox-gartner-testimonial-editor/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:ap-south-1:*:function:remotion-render-4-0-461-*"
    }
  ]
}
```

3. Next → name `testimonial-editor-permissions` → Create policy

Then:

1. **Security credentials** tab → **Create access key**
2. Use case: **Application running outside AWS**
3. Description: `worker-key` → Create
4. **Copy both** the Access key ID and Secret access key. Save somewhere safe.

---

## Step 3 — Create the Cloudflare KV namespace

Easiest: web dashboard.

1. https://dash.cloudflare.com → Workers & Pages → KV
2. **Create a namespace**
3. Namespace name: `TESTIMONIAL_KV`
4. Create

Copy the namespace ID (looks like `abc123def456...`). You'll paste it into wrangler.toml.

---

## Step 4 — Deploy the Remotion site to Lambda

This pushes the testimonial composition to the existing Remotion Lambda function.

In a terminal where you have Node 20+:

```bash
cd remotion
npm install
```

Then deploy. You need AWS credentials available for this command. Easiest is to export them temporarily:

```bash
export AWS_ACCESS_KEY_ID=...your-key-id...
export AWS_SECRET_ACCESS_KEY=...your-secret...
export REMOTION_AWS_REGION=ap-south-1

npx remotion lambda sites create src/index.ts \
  --site-name=testimonial-editor \
  --region=ap-south-1
```

This will print a serve URL like:
```
https://remotionlambda-apsouth1-9dlkcsayxl.s3.ap-south-1.amazonaws.com/sites/testimonial-editor/index.html
```

Copy that exact URL. You'll paste it into `worker/wrangler.toml` (`REMOTION_SERVE_URL`).

---

## Step 5 — Configure & deploy the Worker

```bash
cd worker
npm install
```

### 5a. Edit wrangler.toml

Open `worker/wrangler.toml`. Replace these two values:

- `REMOTION_SERVE_URL` → the URL from Step 4
- `id = "REPLACE_WITH_YOUR_NAMESPACE_ID"` → the KV namespace ID from Step 3

The other fields are already correct.

### 5b. Set the AWS credentials as Worker secrets

```bash
npx wrangler login
npx wrangler secret put AWS_ACCESS_KEY_ID
# (paste the access key ID from Step 2)

npx wrangler secret put AWS_SECRET_ACCESS_KEY
# (paste the secret access key from Step 2)
```

### 5c. Deploy

```bash
npx wrangler deploy
```

You'll get a Worker URL like:
```
https://darwinbox-testimonial-api.<your-cf-subdomain>.workers.dev
```

Copy that URL.

---

## Step 6 — Point the editor at the Worker

Open `docs/js/api.js`. Replace `API_BASE` at the top with the Worker URL from Step 5c:

```js
const API_BASE = 'https://darwinbox-testimonial-api.girishreddy262.workers.dev';
```

---

## Step 7 — Push to GitHub

```bash
cd ..   # back to project root
git add -A
git commit -m "v2: Worker + S3 + Lambda architecture"
git push
```

GitHub Pages will rebuild (~60 sec). Open:
```
https://girishreddy262.github.io/Gartner-Style-Testimonial-Editor/
```

Should show the project list — empty if you deleted everything from v1.

---

## Step 8 — Test end-to-end

1. Click **+ New project**
2. Drop a testimonial video + the matching `callouts.docx`
3. Watch progress: project created → video uploads to S3 (with progress bar) → editor opens
4. Make edits if needed
5. Click **Approve and render**
6. Back on project list, status shows **Rendering**
7. Wait ~85 seconds for a 15-min testimonial
8. Status flips to **Done**, **Download** button appears

If anything errors, check:
- Worker logs: `cd worker && npx wrangler tail` (live tail)
- Cloudflare dashboard → Workers → darwinbox-testimonial-api → Logs

---

## Maintenance commands

```bash
# Update the Worker after a code change
cd worker && npx wrangler deploy

# Watch live Worker logs
cd worker && npx wrangler tail

# Update the Remotion composition (after editing remotion/src/)
cd remotion && npx remotion lambda sites create src/index.ts --site-name=testimonial-editor --region=ap-south-1
# (overwrites the existing site)

# Update the editor UI (docs/)
git add docs && git commit -m "Editor update" && git push
```

## Cost estimates

| Item | Cost |
|---|---|
| Cloudflare Worker | Free (100k requests/day) |
| Cloudflare KV | Free (100k reads/day, 1k writes/day) |
| S3 storage (per testimonial) | ~$0.05/month |
| S3 egress (per download) | ~$0.05 |
| Lambda render (15-min testimonial) | ~$0.15 |
| **Per testimonial total** | **~$0.20** |
