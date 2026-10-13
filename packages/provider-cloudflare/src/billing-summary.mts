import { createProviderHttpTransport } from '@crowsi/provider-http-transport'
import { segment } from '@crowsi/provider-http-transport/local-control'
import type { LocalAccount } from '@crowsi/provider-http-transport/local-control'
const origin = 'https://api.cloudflare.com'
const fields = ['id', 'account_id', 'company', 'type', 'state', 'currency', 'billing_email', 'invoice_email', 'payment_country']
/** Billing profiles may include payment nonces/validation codes; only reviewed summary fields leave the owner. */
export function billingSummaryAdapter(account: LocalAccount, implementation: typeof fetch = globalThis.fetch): typeof fetch {
  const endpoint = `${origin}/client/v4/accounts/${segment(account.account)}/billing/profile`
  const transport = createProviderHttpTransport({ allowedOrigins: [origin], fetchImplementation: implementation,
    maximumRequestBytes: 65536, maximumResponseBytes: 1048576, timeoutMs: 15000 })
  return async (input, init) => {
    if (typeof input !== 'string' || input !== endpoint || init?.method !== 'GET') return implementation(input, init)
    const response = await transport.request({ url: input, method: 'GET', headers: init.headers, signal: init.signal ?? undefined })
    if (response.status !== 200) return new Response('{}', { status: response.status })
    let summary: Record<string, string | boolean | null>
    try {
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body))
      if (body.success !== true || !body.result || typeof body.result !== 'object' || Array.isArray(body.result)) {
        throw new Error('invalid billing profile')
      }
      summary = {}
      for (const field of fields) {
        const value = body.result[field]
        if (value === undefined) continue
        if (value !== null && typeof value !== 'string' && typeof value !== 'boolean') throw new Error('invalid billing field')
        if (typeof value === 'string' && value.length > 1024) throw new Error('oversized billing field')
        summary[field] = value
      }
    } catch { throw new Error('provider/billing/profile-rejected') }
    // Do not expose a hash of secret-bearing raw profile data as a guessing oracle.
    return new Response(JSON.stringify({ kind: 'cloudflare-billing-profile-summary', fields: summary }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}
