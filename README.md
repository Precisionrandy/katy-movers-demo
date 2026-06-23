# Katy Movers — Precision Partners Demo Site

A real, working demo built for Katy Movers (katymovers.com) to show what
their site could look like with an AI-powered quote intake system live on
it. This is not a static mockup — the quote widget on the homepage talks to
a real backend that scores leads using the same logic a production
Precision Partners deployment would run after a live phone call.

## What's actually real here

- The quote form submits to a real API (`POST /api/quote`)
- The backend calculates a genuine estimate based on home size, distance,
  special items (piano/gun safe/pool table/fine art), and peak season timing
- Every submission is stored as a structured lead record (`GET /api/leads`)
- The server logs exactly where a real Twilio SMS send, owner alert, and
  Supabase/CRM push would happen — clearly marked as stubs, not hidden

## What's simulated (clearly marked as stubs in `server.js`)

- SMS sending (`sendConfirmationSms`) — logs to console instead of calling Twilio
- Owner "active shopper" alerts (`notifyOwnerIfShoppingAround`) — logs instead of sending a real-time push/SMS
- CRM/dashboard sync (`pushToCrm`) — logs instead of writing to Supabase
- Distance calculation — uses a simplified ZIP-prefix heuristic instead of a real geocoding/distance API
- The in-memory `leads` array stands in for a Supabase table — it resets every time the server restarts

None of these are hidden or faked silently — every stub prints a clear
`[STUB]`-labeled log line showing exactly what it would do in production,
so anyone reading the code (or `/api/health` logs) can see precisely where
real integrations plug in.

## Running it locally

Requires Node.js 18+ (no `npm install` needed — zero external dependencies).

```bash
node server.js
```

Then open `http://localhost:8080` in a browser.

Useful endpoints while testing:

```bash
# Health check
curl http://localhost:8080/api/health

# Submit a test quote
curl -X POST http://localhost:8080/api/quote \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Sarah",
    "lastName": "Mitchell",
    "phone": "(281) 555-0142",
    "moveDate": "2026-07-15",
    "homeSize": "3BR",
    "originZip": "77494",
    "destZip": "77019",
    "specialItems": ["Piano"]
  }'

# View everything captured so far
curl http://localhost:8080/api/leads
```

## Project structure

```
katy-movers-demo/
├── server.js              ← entire backend, zero dependencies
├── public/
│   ├── index.html          ← page markup
│   ├── styles.css          ← all styling
│   └── app.js              ← frontend logic, talks to /api/quote
└── docs/
    └── ARCHITECTURE.md     ← how this maps to the real Precision Partners stack
```

## Deploying this for real (so Katy Movers can actually click a live link)

This is intentionally built with zero npm dependencies so it deploys
almost anywhere with no build step. Three good options, easiest first:

### Option A — Render.com (free tier, easiest)
1. Push this folder to a GitHub repo
2. Create a new "Web Service" on Render, point it at the repo
3. Build command: (leave blank — nothing to build)
4. Start command: `node server.js`
5. Render gives you a live `*.onrender.com` URL in a couple minutes

### Option B — Railway.app (free tier, also easy)
1. Push to GitHub
2. "Deploy from GitHub repo" on Railway
3. It auto-detects Node and runs `node server.js`
4. Live URL in under a minute

### Option C — A real VPS (DigitalOcean, Linode, etc.)
1. `git clone` the repo on the server
2. Run with a process manager so it survives reboots/crashes:
   ```bash
   npm install -g pm2
   pm2 start server.js --name katy-movers-demo
   pm2 save
   ```
3. Put it behind Nginx with a free Let's Encrypt SSL cert for a real domain

For a quick one-off send-the-link demo, Option A is the fastest path —
free, no credit card typically required, live in minutes.

## Important note on this being a sales tool, not a production deployment

This demo is built to be shown to Katy Movers as a proof of concept — "here's
what your site could do." It is **not** wired to real Twilio/VAPI/Supabase
yet, and shouldn't be treated as production-ready for actually capturing real
customer leads until those integrations are built (see ARCHITECTURE.md for
exactly what that involves). The in-memory lead storage means any real
submissions would be lost on server restart — fine for a demo, not fine for
a live business.
