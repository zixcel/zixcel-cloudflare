import { parameters, segment } from '@crowsi/provider-http-transport/local-control'
import type { LocalOperation } from '@crowsi/provider-http-transport/local-control'
const origin = 'https://api.cloudflare.com/client/v4'
export const discoveryOperations: readonly LocalOperation[] = [
  { id: 'accounts.list', effect: 'read', requiredPermissions: ['Account Settings Read'],
    build(input) { const p = parameters(input, ['page'])
      if (!Number.isSafeInteger(p.page) || (p.page as number) < 1 || (p.page as number) > 1000) throw new Error('provider/input/page')
      return { method: 'GET', url: `${origin}/accounts?page=${p.page}&per_page=50` } } },
  { id: 'token.account-verify', effect: 'read', requiredPermissions: [],
    build(input, a) { parameters(input, []); return { method: 'GET', url: `${origin}/accounts/${segment(a.account)}/tokens/verify` } } },
  { id: 'token.user-verify', effect: 'read', requiredPermissions: [],
    build(input) { parameters(input, []); return { method: 'GET', url: `${origin}/user/tokens/verify` } } },
]
