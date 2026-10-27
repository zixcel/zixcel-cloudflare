# Cloudflare operation guidance

Use **MEANING → REQUIREMENTS → EVIDENCE → NEXT** before a remote request.
Requires Zix CLI 0.6.0 and this provider's guided protocol v2 release.

```sh
zix prompt cloudflare
zix describe cloudflare --guidance --format json
```

The canonical operation definitions are [guidance.json](../crates/cloudflare-cli/api/guidance.json).
Runtime diagnostics, exported catalogs and short command descriptions use those
same definitions. Detailed requirements are selector-specific; inspect an
operation with `--operation ID --argument NAME=VALUE --format json`.

Use `diagnostic.resolved_actions` only after checking availability, effect,
missing arguments and user authorization. A runnable argument shape does not
prove credential validity, permission, freshness or approval. Requirements are
declarations, not confirmed missing rights. Authentication and consent changes
remain explicit; no automatic permission grant or retry is introduced.

`NeedsResolution` exits 2 while retaining partial evidence in `result`.
`OUTCOME UNKNOWN` requires readback of the original attempt before a separately
reviewed new plan. Never replay a write solely because its response was unclear.
Actual domains, accounts, addresses and credentials stay in private inputs.

The shared [Zix guidance contract](https://github.com/zixcel/cli/blob/main/docs/operation-guidance.md)
defines compatibility and LLM sequencing. Legacy plugins remain discoverable
with their actual declared coverage; unavailable capabilities are not invented.

`dns.audit` reads only zone identity and DNS records. It stops before the DNS
request if zone identity is denied or mismatched. It does not read account
Workers, Pages or application security settings. `lifecycle.observe` remains an
explicit broader inventory; a partial response is evidence of unresolved
resources, not a request to broaden token permissions automatically.
