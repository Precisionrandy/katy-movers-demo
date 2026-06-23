/**
 * Katy Movers demo — backend server
 * ----------------------------------
 * Built with zero external dependencies (pure Node "http" + "fs") so this
 * runs anywhere Node runs, with no npm install step required.
 *
 * In production this file's job would be done by:
 *   - N8N webhook (receives the same POST /api/quote payload)
 *   - A scoring workflow node (same logic as scoreQuote() below)
 *   - A Supabase insert (same shape as the `leads` arrhay below)
 *   - A Twilio SMS send (same place as the sendConfirmationSms() stub)
 *
 * See /docs/ARCHITECTURE.md for the full production wiring diagram.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = __dirname;

// ── Startup diagnostics ──────────────────────────────────────────
// These logs appear in Render's "Logs" tab and make it obvious whether
// the public/ folder shipped with the deploy and where it actually is.
console.log("[startup] __dirname:", __dirname);
console.log("[startup] PUBLIC_DIR:", PUBLIC_DIR);
try {
  const exists = fs.existsSync(PUBLIC_DIR);
  console.log("[startup] public/ exists:", exists);
  if (exists) {
    console.log("[startup] public/ contents:", fs.readdirSync(PUBLIC_DIR).join(", "));
  } else {
    console.log("[startup] files next to server.js:", fs.readdirSync(__dirname).join(", "));
  }
} catch (e) {
  console.log("[startup] could not read directory:", e.message);
}

// ── In-memory "database" ─────────────────────────────────────────
// Stand-in for Supabase. Same record shape as a production `leads` table.
const leads = [];
let leadIdCounter = 1001;

// ── Quote scoring engine ─────────────────────────────────────────
// Stand-in for the N8N workflow that would run after a real VAPI call.
// This mirrors the moving-specific rubric discussed for Precision Partners:
// home size, distance, special items, and seasonal timing all factor in.

const BASE_RATES_BY_SIZE = {
  Studio: { low: 450, high: 650 },
  "1BR": { low: 650, high: 950 },
  "2BR": { low: 950, high: 1350 },
  "3BR": { low: 1350, high: 1850 },
  "4BR+": { low: 1850, high: 2600 },
};

const CREW_BY_SIZE = {
  Studio: { crew: "2-man crew", truck: "16ft truck" },
  "1BR": { crew: "2-man crew", truck: "16ft truck" },
  "2BR": { crew: "3-man crew", truck: "20ft truck" },
  "3BR": { crew: "3-man crew", truck: "26ft truck" },
  "4BR+": { crew: "4-man crew", truck: "26ft truck" },
};

const SPECIAL_ITEM_SURCHARGE = {
  Piano: 175,
  "Gun safe": 125,
  "Pool table": 200,
  "Fine art / antiques": 100,
};

function isLongDistance(originZip, destZip) {
  if (!originZip || !destZip) return false;
  // Simplified heuristic for demo purposes: different 3-digit ZIP prefix
  // is treated as a signal for a longer-distance move. A production system
  // would call a real distance/geocoding API here instead.
  return originZip.slice(0, 3) !== destZip.slice(0, 3);
}

function isPeakSeason(moveDateStr) {
  if (!moveDateStr) return false;
  const month = new Date(moveDateStr + "T00:00:00").getMonth() + 1; // 1-12
  return month >= 5 && month <= 9; // May–September
}

function scoreQuote(payload) {
  const sizeKey = BASE_RATES_BY_SIZE[payload.homeSize] ? payload.homeSize : "2BR";
  const base = BASE_RATES_BY_SIZE[sizeKey];
  const crewInfo = CREW_BY_SIZE[sizeKey];

  let low = base.low;
  let high = base.high;

  const longDistance = isLongDistance(payload.originZip, payload.destZip);
  if (longDistance) {
    low = Math.round(low * 2.4);
    high = Math.round(high * 2.8);
  }

  let surcharge = 0;
  (payload.specialItems || []).forEach((item) => {
    surcharge += SPECIAL_ITEM_SURCHARGE[item] || 50;
  });
  low += surcharge;
  high += surcharge;

  const peak = isPeakSeason(payload.moveDate);
  if (peak) {
    low = Math.round(low * 1.08);
    high = Math.round(high * 1.08);
  }

  return {
    low,
    high,
    crew: crewInfo.crew,
    truck: crewInfo.truck,
    moveType: longDistance ? "long-distance" : "local",
    peakSeason: peak,
    surchargeApplied: surcharge,
  };
}

// ── Stub integrations (clearly marked — replace with real calls) ──

function sendConfirmationSms(lead) {
  // PRODUCTION: replace with a real Twilio Programmable Messaging API call.
  console.log(
    `[SMS STUB] Would text ${lead.phone}: "Hi ${lead.firstName}! Thanks for ` +
      `requesting a quote with Katy Movers. Estimated range: $${lead.estimate.low}-$${lead.estimate.high}. ` +
      `We'll call to confirm details soon."`
  );
}

function notifyOwnerIfShoppingAround(lead) {
  // PRODUCTION: replace with a real-time alert (SMS/Slack/push) to the owner
  // when the AI detects active-shopper language during a live call.
  // This demo simulates the signal using howHeard + a simple heuristic.
  if (lead.shoppingAround) {
    console.log(
      `[OWNER ALERT STUB] Active shopper detected: ${lead.firstName} ${lead.lastName} — ` +
        `recommend callback within 10 minutes.`
    );
  }
}

function pushToCrm(lead) {
  // PRODUCTION: replace with a Supabase insert (or REST call to the
  // Precision Partners API) so this lead appears in the dashboard's
  // Contacts/Calls tab exactly like a real phone-call-derived lead.
  console.log(`[CRM STUB] Lead #${lead.leadId} pushed to dashboard contacts table.`);
}

// ── Request handlers ─────────────────────────────────────────────

function handleQuote(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1e6) req.destroy(); // basic guard against oversized payloads
  });

  req.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(body || "{}");
    } catch (err) {
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const required = ["firstName", "lastName", "phone", "moveDate", "homeSize", "originZip", "destZip"];
    const missing = required.filter((f) => !payload[f]);
    if (missing.length) {
      return sendJson(res, 422, { error: "Missing required fields", fields: missing });
    }

    const estimate = scoreQuote(payload);

    // Simplified "active shopper" signal for demo purposes — in a real
    // VAPI call this would come from intent detection on the live transcript.
    const shoppingAround = false;

    const lead = {
      leadId: leadIdCounter++,
      createdAt: new Date().toISOString(),
      firstName: payload.firstName,
      lastName: payload.lastName,
      phone: payload.phone,
      email: payload.email || null,
      moveDate: payload.moveDate,
      homeSize: payload.homeSize,
      originZip: payload.originZip,
      destZip: payload.destZip,
      specialItems: payload.specialItems || [],
      howHeard: payload.howHeard || null,
      source: payload.source || "website_widget",
      businessSlug: payload.businessSlug || "unknown",
      estimate,
      moveType: estimate.moveType,
      shoppingAround,
      status: "New",
    };

    leads.push(lead);

    sendConfirmationSms(lead);
    notifyOwnerIfShoppingAround(lead);
    pushToCrm(lead);

    sendJson(res, 200, lead);
  });
}

function handleListLeads(req, res) {
  // Simple internal endpoint to inspect captured leads during the demo —
  // stands in for what the real Precision Partners dashboard Contacts tab
  // would render from Supabase.
  sendJson(res, 200, { count: leads.length, leads });
}

function sendJson(res, statusCode, data) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(req, res) {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";

  // Normalize and resolve to an absolute path, then verify it stays inside
  // PUBLIC_DIR. Using path.resolve on both sides is more robust across
  // operating systems and hosting environments than a raw startsWith.
  const requested = path.normalize(path.join(PUBLIC_DIR, urlPath));
  const publicRoot = path.resolve(PUBLIC_DIR);

  if (!path.resolve(requested).startsWith(publicRoot)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Forbidden");
  }

  fs.readFile(requested, (err, data) => {
    if (err) {
      console.log("[404] could not serve:", requested, "-", err.code);
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const ext = path.extname(requested);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// ── Router ────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/quote") {
    return handleQuote(req, res);
  }
  if (req.method === "GET" && req.url === "/api/leads") {
    return handleListLeads(req, res);
  }
  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, 200, { status: "ok", leadsCaptured: leads.length, uptime: process.uptime() });
  }
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Katy Movers demo running at http://localhost:${PORT}`);
  console.log(`  Health check:  GET  /api/health`);
  console.log(`  Submit quote:  POST /api/quote`);
  console.log(`  View leads:    GET  /api/leads`);
});
