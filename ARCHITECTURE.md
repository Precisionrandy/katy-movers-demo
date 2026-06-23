# Architecture — Demo vs. Real Precision Partners Deployment

This document maps every piece of this demo to the real Precision Partners
stack (VAPI, Twilio, ElevenLabs, N8N, Supabase) so it's clear exactly what
would need to be built to take this from "demo" to "live system actually
running Katy Movers' phones."

## High-level flow comparison

### This demo (website form only)
```
Customer fills out form on katymovers-demo site
        ↓
POST /api/quote  (this server.js file)
        ↓
scoreQuote() calculates estimate in-process
        ↓
Lead pushed into an in-memory JS array
        ↓
Console.log stubs show where SMS/CRM would fire
        ↓
Result rendered back to the customer in the browser
```

### Real production system (phone calls + website, fully wired)
```
Customer calls the Katy Movers number  OR  fills out the website form
        ↓
[PHONE PATH]                          [WEBSITE PATH]
Twilio receives the call               Form posts to an N8N webhook
        ↓                                       ↓
Twilio forwards audio to VAPI          N8N runs the same scoring logic
        ↓                                       ↓
VAPI runs the AI conversation,         N8N writes the lead to Supabase
guided by the intake script                     ↓
        ↓                              N8N triggers Twilio SMS confirmation
VAPI extracts structured data                   ↓
(name, move date, home size, zips,     If "shopping around" detected,
special items) from the transcript    N8N sends an instant owner alert
        ↓                                       ↓
Twilio's recording is stored           Lead appears in the Precision
        ↓                              Partners dashboard (Contacts/Calls
N8N receives the call-ended webhook    tab) in real time
from VAPI, runs the same scoring
logic used in this demo's
scoreQuote() function
        ↓
N8N writes the lead + call recording
+ transcript to Supabase
        ↓
N8N triggers a Twilio SMS confirmation
        ↓
Lead appears in the Precision Partners
dashboard, identical in shape to a
website-submitted lead
```

The key design decision in this demo: **the scoring logic lives in one
function (`scoreQuote()` in `server.js`) so it's the single source of truth**
regardless of whether the lead came from a phone call or a website form.
In production, this same logic should live in one N8N workflow (or one
shared library that both the VAPI webhook handler and the website webhook
handler call into) — not duplicated in two places that can drift apart.

## Component-by-component mapping

| Demo component | Real production equivalent | What changes |
|---|---|---|
| `server.js` in-memory `leads` array | Supabase `leads` / `calls` table | Swap array push/read for Supabase client insert/select calls. Same field names, so the migration is mostly mechanical. |
| `scoreQuote()` function | N8N "Score Lead" workflow node (or a shared scoring microservice) | Same input/output shape. Move the logic from inline JS into an N8N Function node, or keep it as a small internal API that N8N calls via HTTP request node. |
| `sendConfirmationSms()` stub | Twilio Programmable Messaging API call | Replace `console.log` with a real `twilio.messages.create({...})` call, triggered by N8N after the Supabase insert succeeds. |
| `notifyOwnerIfShoppingAround()` stub | Real-time SMS/push to the business owner | Wire to Twilio (SMS) or a push notification service, triggered by an N8N conditional branch when VAPI's live transcript matches "shopping around" intent patterns. |
| `pushToCrm()` stub | Supabase insert + dashboard real-time subscription | Once written to Supabase, the existing Precision Partners dashboard (which already reads from Supabase) picks this up automatically — no separate "push" step needed if using Supabase's realtime features. |
| Website quote form (`index.html` / `app.js`) | Same HTML/JS, but posting to a real N8N webhook URL instead of `/api/quote` | Frontend changes are minimal — swap the `fetch()` URL in `app.js`. The actual form fields and UX can stay as-is. |
| *(not in this demo)* | VAPI conversation flow for phone calls | This is the piece this demo doesn't simulate — VAPI handling the live voice conversation and extracting the same structured fields (name, move date, home size, zips, special items) that the website form collects directly. This would use the moving-specific intake script discussed separately — see the "Call Intake Script" example built out earlier for this vertical. |
| `isLongDistance()` ZIP-prefix heuristic | A real distance/geocoding API call (Google Maps Distance Matrix, or similar) | The demo's heuristic is intentionally simplistic — same-prefix ZIPs are treated as local. Production should calculate actual driving distance for accurate pricing, especially near prefix boundaries where the heuristic would misfire. |

## What would need to be built to go live (in priority order)

1. **N8N webhook to replace `/api/quote`** — point the existing website
   form at a new N8N webhook URL. N8N receives the same JSON payload this
   demo's `server.js` already expects, so the payload contract doesn't
   need to change.

2. **Supabase `leads` table** — mirror the lead object shape already used
   in this demo (`leadId`, `firstName`, `lastName`, `phone`, `moveDate`,
   `homeSize`, `originZip`, `destZip`, `specialItems`, `estimate`, etc.)
   so the existing Precision Partners dashboard can read it with minimal
   changes to the dashboard's existing query logic.

3. **Move the `scoreQuote()` logic into N8N** — either as a Function node
   running the same JS, or rebuilt as an equivalent N8N node chain. This
   keeps scoring logic in exactly one place once the phone-call path is
   added later, rather than having two implementations that can drift.

4. **Wire real Twilio SMS** — replace the `sendConfirmationSms` stub with
   an actual Twilio API call inside the N8N workflow, using the Twilio
   credentials already configured for the client's main business number.

5. **Build the VAPI phone intake flow** — the bigger lift: configure VAPI
   with a moving-specific conversation script that asks the same questions
   the website form collects (move date, home size, zips, special items),
   then POSTs the extracted data to the same N8N webhook from step 1. Once
   this exists, phone leads and website leads both flow through the exact
   same scoring and storage pipeline.

6. **Real distance calculation** — swap the ZIP-prefix heuristic for an
   actual distance API call, since pricing accuracy matters most exactly
   at the local/long-distance boundary where the heuristic is weakest.

7. **Active-shopper detection** — once VAPI is live, configure intent
   detection on the call transcript (keywords/phrases like "comparing a
   few companies," "getting other quotes") to flip the
   `shoppingAround` flag in real time during the call, not just on
   website submissions.

## Hosting for the real version

The production version would run on whatever infrastructure already hosts
the rest of the Precision Partners dashboard and N8N instance — there's no
need for Katy Movers' website specifically to be hosted separately from
how it is today. The only new pieces are:

- The N8N webhook endpoint (already have N8N running)
- The Supabase table (already have Supabase running)
- The VAPI assistant configuration for this specific business (industry
  template = "Moving," same pattern as the existing HVAC/insurance
  templates)

This demo's standalone Node server (`server.js`) exists purely so this can
be shown to Katy Movers as a real, clickable, working link **before** any
of the above production wiring is built — it's a sales and proof-of-concept
tool, not a parallel system that would need to be maintained long-term.

---

# Update — Speed-to-Lead, Pay-to-Confirm, Chat & Reviews

This captures the additional features specified for the moving vertical, and
exactly how each demo piece maps to production.

## 1. Speed-to-lead (the core backend promise)

The moment a quote is submitted (website form OR phone call), the flow is:

```
Lead captured
   ↓
Instantly (within seconds, not hours):
   ├── Text the customer a confirmation + recap of their quote
   └── Notify the business owner to CALL — push/SMS/dashboard alert
   ↓
Owner calls back while the customer is still deciding
```

In the demo, `server.js` already logs `[SMS STUB]` and `[OWNER ALERT STUB]`
at exactly the points where these fire. In production:
- Customer text → Twilio Programmable Messaging
- Owner alert → Twilio SMS or push notification, triggered by N8N the instant
  the lead row is written to Supabase
- The whole point is SPEED: the business that calls back first wins the move.

## 2. Pay-to-confirm (lock in the booking)

```
Owner reviews the lead, confirms/adjusts the quote
   ↓
One tap: "Send payment link"
   ↓
Customer gets a secure deposit/payment link (Stripe)
   ↓
Customer pays → date is locked → job is booked
```

In production this is a Stripe Checkout / Payment Link generated per quote,
sent via the same Twilio SMS channel. The demo's result card is where the
"confirmation text" reference already sets this up. Per the platform's
safety rules, the customer always completes payment themselves through
Stripe's own interface — the system never handles raw card details.

## 3. Chat assistant

The demo chat (`app.js` → chatbot section) answers from a hardcoded `BIZ`
facts object: service area, pricing approach, hours, piano specialty,
licensing, etc. It offers a live person ("call us / have someone call you")
after a couple of exchanges or whenever the question needs a human.

In production, swap the demo's `answerFor()` matcher for a real call:
`POST /api/chat` with `{ message, history, businessFacts }`, where the
backend calls the AI model with the business's own settings as context, so
answers are accurate per-business and stay in scope (no quoting policy it
shouldn't, etc.). The "talk to a live person" handoff stays exactly as-is.

## 4. Google reviews

The demo renders 6 placeholder reviews + a 4.9-star Google badge from a
`REVIEWS` array in `app.js`. In production:
- `GET /api/reviews` proxies the Google Places API (Place Details → reviews)
  using the business's Place ID, cached server-side to respect rate limits.
- Same render code, real live reviews.
- Note: Google's API returns up to 5 reviews per call and has display-term
  requirements (must show the Google logo, attribution) — already reflected
  in the demo's card design.
