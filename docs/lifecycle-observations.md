# Bounded Cloudflare lifecycle and DNS observations

The native Rust library `zixcel-cloudflare-observer` owns Cloudflare response
decoding. Domain consumers reconcile its evidence with registrar settings and
actual DNS delegation; neither provider infers ownership from hostnames.

```sh
zix cloudflare lifecycle observe --account ACCOUNT_ID --workers website
zix cloudflare dns audit --account ACCOUNT_ID --zone ZONE_ID --domain example.org
```

An existing read token is supplied as `ZIX_CLOUDFLARE_ACCESS_TOKEN` in the process
environment, never argv or a source file. This tool does not store or renew it.
No CI account token, scheduler, new credential or remote mutation is required.
Reports contain private operational metadata; retain them with private permissions.

The fixed HTTPS origin, verified TLS, no proxy/redirect/retry transport, 40-second
deadline, 32-request budget, 1 MiB per response, 4 MiB aggregate HTTP budget and
two-page/200-row per-list limit are enforced independently. The protocol also
refuses output above the dispatcher's response limit. Oversize does not mean safe.

States are supported, denied, unobserved and partial. Incomplete, hidden, missing,
changing or duplicated pages are never a complete empty inventory. Supported
means the selected projection was read, not comprehensive security acceptance.
Only explicit worker names receive workers.dev/preview setting reads. Pages
deployment details, actual HTML transformations and effective privacy behavior
remain unobserved. API settings alone do not prove website behavior.

Zone reads require an exact zone/account/domain match. Projections include DNS,
DNSSEC, routes, SSL settings, managed security.txt and bot configuration; account
reads include Workers, custom domains, Pages, Web Analytics and Turnstile widget
metadata. Script source, bindings, snippet content and widget secrets are omitted.
UTC calendar dates are parsed rather than inferred from string shape.

`lifecycle::review` accepts caller-owned production/preview/retired intent and
optional expiry. Missing expiry remains unknown. Undeclared resources have
unknown intent. `lifecycle::receipt` binds a complete observed postcondition to
source/artifact digests after a producer-local creation/end operation. Neither
function creates grants, applies changes, deletes resources or installs a timer.
Report hashes detect content drift, not authenticity or an atomic API snapshot.

## Security dashboard findings

- DMARC syntax and public DNS evidence belong to the Domain reconciler. Correct
  syntax alone does not prove SPF/DKIM alignment, deliverability or all senders.
- Managed security.txt configuration and actual `/.well-known/security.txt`
  delivery are separate. An approved security contact and expiry are required.
- Bot Fight Mode may challenge API/agent traffic and cannot be skipped through
  WAF custom rules. An unset recommendation is not permission to enable it.
- `crawler_protection` is recorded as the vendor field; UI labels and intended
  AI crawler access require owner review before changing behavior.
- Turnstile widget existence is not frontend integration or server-side
  Siteverify acceptance. The tool never fetches or emits a widget secret.

Official contracts (reviewed 2026-10-22):

- https://developers.cloudflare.com/api/resources/dns/subresources/dnssec/methods/get/
- https://developers.cloudflare.com/api/resources/security_txt/
- https://developers.cloudflare.com/api/resources/bot_management/
- https://developers.cloudflare.com/api/resources/rum/subresources/site_info/methods/list/
- https://developers.cloudflare.com/turnstile/get-started/widget-management/api/
- https://developers.cloudflare.com/bots/get-started/bot-fight-mode/

Synthetic development tests do not claim live account, DNS, browser, recurring
execution, retirement or remote configuration acceptance.
