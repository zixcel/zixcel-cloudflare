import { billingSummaryAdapter } from './billing-summary.mjs'
import { discoveryOperations } from './discovery.mjs'
import { createLocalProviderControl, parameters, segment, text } from '@crowsi/provider-http-transport/local-control'
import type { CredentialSource, LocalAccount, LocalOperation } from '@crowsi/provider-http-transport/local-control'
const origin = 'https://api.cloudflare.com'
const scope = (a: LocalAccount) => `${origin}/client/v4/accounts/${segment(a.account)}`
export const operations: readonly LocalOperation[] = Object.freeze([
  ...discoveryOperations,
  { id: 'account.read', effect: 'read', requiredPermissions: ['Account Settings Read'],
    build(input, a) { parameters(input, []); return { method: 'GET', url: scope(a) } } },
  { id: 'account.set-name', effect: 'write', requiredPermissions: ['Account Settings Write'],
    build(input, a) { const p = parameters(input, ['name']); return { method: 'PUT', url: scope(a), body: JSON.stringify({ name: text(p.name, 65) }) } } },
  { id: 'billing.profile-read', effect: 'read', requiredPermissions: ['Billing Read'],
    build(input, a) { parameters(input, []); return { method: 'GET', url: `${scope(a)}/billing/profile` } } },
])
export function createControl(account: LocalAccount, credentials: CredentialSource, fetchImplementation?: typeof fetch, extensions: readonly LocalOperation[] = []) {
  if (account.provider !== 'cloudflare') throw new Error('provider/account/mismatch')
  segment(account.account)
  return createLocalProviderControl({ account, credentials, operations: [...operations, ...extensions], allowedOrigins: [origin], fetchImplementation: billingSummaryAdapter(account, fetchImplementation) })
}

export { localKeyringCredential as keyringCredentials } from '@crowsi/provider-http-transport/local-control'

export const serviceProfile = Object.freeze({
  provider: "cloudflare",
  accountScope: "Account ID; account discovery is credential-visible and paginated.",
  credentialSource: "Owner-provided user or account API token; verification endpoint is explicitly selected, with no fallback.",
  permissionCoverage: "Token verification is token state, not complete policy/effective permission inventory.",
  billingCoverage: "Billing profile is configuration, not an invoice or usage total.",
  permissionState: 'not-observed' as const,
  operations: Object.freeze(operations.map(({ id, effect, requiredPermissions }) =>
    Object.freeze({ id, effect, requiredPermissions: Object.freeze([...requiredPermissions]) }))),
})
