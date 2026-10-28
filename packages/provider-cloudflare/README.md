# @zixcel/provider-cloudflare

Local administrator operations composed with Crowsi's one-use HTTP control.
This is the Node runtime package, separate from any existing Rust planning API.

## Install

```sh
npm install @zixcel/provider-cloudflare
```

Registry publication is a separate gate; the initial candidate is not declared
published until its official archive and provenance are verified.

## Initial catalog

Cloudflare account identity/name and billing profile. A billing profile is not an invoice or usage total. Restricted usage APIs are not presumed accessible.

## Trusted owner composition

```js
import { createControl } from '@zixcel/provider-cloudflare'
const control = createControl(account, credentialSource)
const plan = control.prepare(operationId, input)
// Present method, URL, exact body, effect and permissions to the administrator.
const grant = control.approve(plan, Date.now() + 30_000)
const receipt = await control.execute(grant.id, plan)
```

The account identifies provider, subject and account scope. The trusted owner
supplies credentials; callers never receive the bearer token. Only expose an
execute port to generated code, and run it in a separately restricted workload.
Local approval does not grant remote provider permissions. Required permissions
are operation metadata, not proof of effective access or complete IAM inventory.

Read and write use the same prepare/approve/execute protocol. There is no login,
network request, keyring lookup, cloud mutation or billing action on import.
Unknown operations and extra input fields are rejected. Pagination is not
followed automatically; review a separate request for every additional page.

The optional fourth argument is a trusted-owner extension catalog. Extensions
must declare their method, exact resource mapping, input validation, effect and
permission requirements. The same account/destination/body/grant boundary applies.
Never let an LLM supply that catalog or acquire a new grant without owner review.

## Test isolation

```sh
npm ci --ignore-scripts
npm test
```

Tests inject fake credentials and fake HTTP state. They verify read and write,
changed resource rejection and permission denial without reading the host's
credential stores or contacting provider accounts. These tests do not establish
actual-account acceptance. Production connection is a later, separate operation.

The first catalog is intentionally bounded. Binary finance reports, complete
provider IAM introspection, continuous polling and destructive operations are
not implemented by this release. Do not substitute planning for observed rights,
or estimates for final provider invoices.

Apache-2.0. See LICENSE and NOTICE. Source: zixcel/zixcel-cloudflare.

## Administrator discovery (new source catalog)

`serviceProfile` describes the actual account scope, credential source, bounded operation list, and limits of permission/billing coverage. It contains no credentials, performs no login/request and reports `not-observed`; required permissions remain declarations. Discovery is a separate one-use reviewed read, not automatic account selection or authorization. Each cursor/page requires its own plan and grant. Source additions are not contained in the previously published package version until a new release is accepted.

`token.account-verify` and `token.user-verify` are distinct owner selections. Active token state does not prove access to every resource; no token-type fallback is attempted.

## Billing profile summaries (new source behavior)

`billing.profile-read` projects a successful Cloudflare response to reviewed scalar summary fields. Payment nonces, validation codes and unreviewed fields are omitted; raw secret-bearing profile bytes or their hash are not returned. An HTTP 200 envelope with `success:false` or malformed result is rejected. The summary remains configuration information, not invoice/usage data or authorization to pay/change a billing profile.

Primary reference: [Cloudflare billing profile](https://developers.cloudflare.com/api/resources/billing/subresources/profiles/methods/get/). The adapter reuses bounded Crowsi HTTP and the existing one-use approval flow.

## Pinned edge verification (0.2.0)

The separate `@zixcel/provider-cloudflare/edge-verification` export has no provider
transport or credential imports. `originHtml(bytes, pins)` removes at most one
exact full-tag hash per declared analytics/jsd role at the body end. Only the JSD
ray ID and a canonical base64 numeric timestamp are normalized. Unknown/duplicate
scripts, moved tags and changed body bytes must still fail the caller's exact
artifact hash check. This is not a signature/trust verdict, sanitization, script
execution or permission to weaken Cloudflare protection. Pins are explicit owner
review inputs; never learn/approve them automatically from live responses.

## Account token provisioning (new source behavior)

`@zixcel/provider-cloudflare/account-token-provisioning` creates one account-owned
API token using a caller-reviewed policy and sends its one-time value only to a
trusted callback. It returns a token ID and status, never the credential or API
error body. It does not validate that a policy grants minimum access, verify
remote permissions, or retry an uncertain request. A failed sink causes a best
effort revocation of the new token; inspect `ProvisioningError.recovery` and the
new token ID before any further action. There is no automatic cleanup of old
tokens. The caller must review account, permission groups and resource scope.

`@zixcel/provider-cloudflare/github-environment-secret` supplies a trusted local
GitHub CLI callback. It accepts only secret names ending in `_CANDIDATE`, sends
the value on stdin with no shell, suppresses subprocess output and requires the
caller to provide an already authenticated, trusted `gh`. A candidate must be
verified before any production secret is changed. A timeout is an uncertain
write; do not assume the candidate was absent. These exports are not an
end-to-end deployment workflow or a credential prompt. No token, target account,
repository or policy is configured by this package.

Unit tests use only fabricated data and a fake local secret-store command. Actual
Cloudflare policy support, the candidate's effective access and production GitHub
Environment behavior require separate acceptance testing.

### Local candidate command (new source behavior)

The package exposes `zix-cloudflare-token /absolute/private/config.json` on Node
24. The JSON file contains exactly `request` and `target`: `request` is the
`TokenRequest` for `provisionAccountToken`, and `target` contains `repository`,
`environment`, and `secretName` for `githubEnvironmentSecretSink`. The secret
name must end in `_CANDIDATE`. The file must be an owner-owned regular file with
no group/other permissions and cannot be a symlink or hard link. It must not
contain a credential. Policy resource syntax and permissions must be checked
against the live provider and reviewed by the operator before use.

The command accepts no token argument or token file. It requires a terminal and
reads the bootstrap credential without echo; interruption cancels input before
any network request. Only use it in a trusted local terminal with a trusted,
authenticated GitHub CLI. Candidate storage is not evidence of effective access
or deployment success. A failed or uncertain create or upload is not retried;
inspect the returned recovery state and reconcile manually. Do not delete or
replace any existing production credential until the candidate is independently
verified. Current tests use fake credentials and never reach real providers.

For read-only preflight, `zix-cloudflare-token --inspect CONFIG OUTPUT` verifies
the entered account token and lists account token permission-group metadata. The
output must not exist, and its parent must be an owner-only directory. The
command creates the metadata file with mode 0600; the credential is not saved.
A selectable group is not proof of a specific Worker's effective access.
