# Contact submission Worker — unpublished adapter candidate

Owner: Zixcel (Cloudflare adapter). NuxtJP owns form presentation; each site owner
owns its legal text, destination and enablement. This package is separate from
the Node administrator provider. No administrator token or Node runtime module
is imported by the Worker. The only production dependency is `ipaddr.js` (MIT),
used for IPv4/IPv6 CIDR parsing instead of inventing another IP parser.
Existing `zixcel-mail` SMTP/MIME clients are not needed: Cloudflare's structured
Email Sending binding owns message encoding. There is no SMTP/MIME duplication.

## Request path

Static site GET (unrestricted) → explicit form POST `/v1/submissions` → exact
Origin/site routing → streaming/body/type bounds → IP/CIDR restriction → approximate
per-IP rate limit → strict field/policy validation → server-side Turnstile
hostname/action/age validation → atomic receipt reservation → fixed-destination
plain-text email. Country/region/ASN are optional supplementary filters.

The rate-limit check happens before reading the body; allocation and timeout
limits still apply to requests that do not reach JSON parsing. HTTP errors use
small generic messages, never exception or user text. No application log contains
IP, email, subject, body, token or provider exception. Responses are no-store.

## Restrictions

`config/sites.example.json` is a disabled example; its RFC documentation networks
are not a real VPN list. Run `node tools/check-config.mjs config/sites.example.json`
for a read-only check. No dynamic list download is implemented. Maintain reviewed
IP/CIDR lists with source, retrieval time and expiry in operations records; do not
silently apply third-party changes or send visitor IPs to a reputation service.

- `allowedCidrs: []` imposes no IP allow-list restriction.
- Any matching `deniedCidrs` wins over an allow-list match (IPv4 and IPv6).
- IPv4-mapped client addresses are normalized. Mapped CIDR config is rejected;
  enter its canonical IPv4 range instead.
- Missing/invalid connecting IP is rejected. Geolocation is required only if a
  geographic restriction is configured; missing relevant metadata then rejects.
- `request.cf` and Cloudflare-populated connecting IP are trusted only at the
  Cloudflare entry point. Browser-supplied country/ASN/VPN headers are ignored.
  Do not introduce an untrusted forwarding Worker that can rewrite client IP.
- VPN egress ranges may be blocked through the same CIDR list. This cannot
  identify all VPNs, residential proxies, or a person's actual location.
- CORS is not authentication; direct callers can forge Origin. Turnstile,
  restrictions, bounded inputs and rate controls are enforced server-side.

## Runtime bindings and conservative failure behavior

Source includes an actual Worker entry point and a SQLite Durable Object receipt
reservation adapter. Wrangler candidate has no routes, enabled sites, mail binding
or secrets. It does **not** enable any public endpoint. Before deployment review:

1. Final policy ID/full commit, lawful processing, sender subdomain, M365 recipient,
   mailbox delegation, retention and true sending-domain DNS values.
2. Exact approved routes and origins, body-logging disabled in platform/WAF rules,
   request/CPU budgets and status monitors.
3. `SITES_JSON` (at most 5 KiB), `TURNSTILE_SECRET`, `IP_KEY_SECRET` (>=32 secret
   characters); never put secrets in Nuxt public config or Git.
4. Native `LIMITER` binding with an unused reviewed namespace ID and configured
   limit/period (10 or 60 seconds). This binding is approximate per Cloudflare
   location; it is not a strict global email quota. A shared-IP group can be
   rate-limited together. Configure independent provider/account sending caps.
5. `EMAIL` send binding restricted to the approved sender/destination addresses.
   Missing any required binding returns 503 and cannot deliver mail.
6. `RECEIPTS_NAMESPACE`, using the supplied class/migration. Each submission ID
   atomically reserves one slot for 24 hours. No body, IP or email is persisted.
   A provider error/timeout leaves the reservation; it never starts a retry.
   Duplicate protection is scoped to this 24-hour window, not indefinite.

Outcome 202 means provider accepted, not inbox delivered. Exceptions after delivery
starts are unknown outcomes, even if the provider may ultimately send the email.
No automatic write retries, automatic visitor acknowledgments, attachments, HTML,
user-selected recipients, redirect following or arbitrary external endpoints.

The receipt reservation has a deadline but RPC cancellation is not assumed: a
late reservation may remain, safely preventing mail. A late mail binding result
may mean actual delivery after an unknown response. Reconcile instead of replay.

Nuxt companion: `nuxtjp/nuxtjp-ui/packages/nuxt-contact-form`. The contract parser
in `src/body.mjs` rejects unknown fields and accepts only email/subject/message,
siteKey, submissionId (UUIDv4), policyVersion, turnstileToken. Metadata is not a
new visitor input field. Default site mode remains preview.

## Verification

`npm ci --ignore-scripts`; `npm test`; `npm run typecheck`; `npm audit --omit=dev`.
Tests use synthetic data and mocked external APIs. No secret, new permission,
email send, DNS or Cloudflare deployment occurs. Hosted CI is not required here.
Production bindings, actual zone policies and delivery remain acceptance gates.

## Cost and limits (official docs checked 2026-10-27)

Incoming invocations are counted; outgoing subrequests to external APIs do not
add Workers incoming-request fees. For example one POST making two external API
calls is one incoming request plus two subrequests. A browser cross-origin JSON
POST can also cause an OPTIONS request; count it separately. Network I/O waiting
is not CPU time, while parsing, validation and cryptography consume CPU time.
Free currently permits 100,000 incoming requests/day, 10 ms CPU per invocation,
50 external subrequests per invocation and six simultaneous outgoing connections.
This design is not a proof of fitting the CPU limit on a real account.
Durable Objects operations/storage/alarms, email sending, other Cloudflare
products and third-party API charges have their own limits/pricing. Service
bindings on Standard do not add request fees, but aggregate CPU is charged.
Normal public HTTP calls to another Worker are not equivalent to Service Bindings.

Sources:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/runtime-apis/request/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
