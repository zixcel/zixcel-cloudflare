import { createLocalProviderControl, parameters, segment, text } from '@crowsi/provider-http-transport/local-control'
import type { CredentialSource, LocalAccount, LocalOperation } from '@crowsi/provider-http-transport/local-control'
const origin = 'https://api.cloudflare.com'
const scope = (a: LocalAccount) => `${origin}/client/v4/accounts/${segment(a.account)}`
export const operations: readonly LocalOperation[] = Object.freeze([
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
  return createLocalProviderControl({ account, credentials, operations: [...operations, ...extensions], allowedOrigins: [origin], fetchImplementation })
}

export { localKeyringCredential as keyringCredentials } from '@crowsi/provider-http-transport/local-control'
