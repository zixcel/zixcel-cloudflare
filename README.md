# zixcel-cloudflare

Owner-approved Cloudflare account read/write, token-state discovery and sanitized billing profile summaries.

See [the Node package](packages/provider-cloudflare/README.md) for bounded
read/write operations, one-use authorization and separated test/production setup.

No real cloud account acceptance is claimed by the isolated fixture tests.

[Isolated public API playground and owner operation boundaries](playground/provider-operations/README.md) · [日本語](README.ja.md)

[OSS responsibility and source completion](docs/oss-source-contract.md) defines the supported package boundary and required acceptance. It does not declare unexecuted source, distribution or production checks complete.

## Node administrator baseline

The runtime implementation is in `packages/provider-cloudflare`. Its README defines the reviewed operation catalog, account/credential scope, permission and billing coverage, source additions, examples and isolated test commands. Rust planning-only packages and presentation packages retain their own scopes; a planning fixture is not proof of an external API effect.

Run the Node runtime package's frozen install and tests from that directory. Source additions are reviewed separately from the currently published immutable version and from live-account acceptance. No provider connection or account change occurs during source tests.

Dependency updates: [repository policy](docs/dependency-updates.md).
Registry releases: [version tags and GitHub OIDC](docs/registry-release.md).
