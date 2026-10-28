/** One-shot account token creation. Policies and sink are trusted caller inputs. */
export type TokenPolicy = { effect: 'allow' | 'deny'; permission_groups: readonly { id: string }[]; resources: Readonly<Record<string, unknown>> }
export type TokenRequest = { accountId: string; name: string; policies: readonly TokenPolicy[]; expiresOn?: string }
export type TokenSink = (secret: string, metadata: Readonly<{ id: string }>) => Promise<void>
const idPattern = /^[a-f0-9]{32}$/
export class ProvisioningError extends Error {
  constructor(message: string, readonly recovery: 'none' | 'unknown' | 'revoked' | 'revoke-failed', readonly tokenId?: string) { super(message); this.name = 'ProvisioningError' }
}
function validate(request: TokenRequest): void {
  if (!idPattern.test(request.accountId) || !/^[\w. -]{1,120}$/.test(request.name) || !Array.isArray(request.policies) || request.policies.length < 1 || request.policies.length > 20) throw new ProvisioningError('invalid-request', 'none')
  if (request.expiresOn !== undefined && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(request.expiresOn) || !Number.isFinite(Date.parse(request.expiresOn)) || Date.parse(request.expiresOn) <= Date.now())) throw new ProvisioningError('invalid-expiry', 'none')
  for (const p of request.policies) if (!p || !['allow', 'deny'].includes(p.effect) || !Array.isArray(p.permission_groups) || p.permission_groups.length < 1 || p.permission_groups.length > 100 || p.permission_groups.some((g: { id: string }) => !g || !idPattern.test(g.id)) || !p.resources || typeof p.resources !== 'object' || Array.isArray(p.resources) || !Object.keys(p.resources).length) throw new ProvisioningError('invalid-policy', 'none')
  if (Buffer.byteLength(JSON.stringify(request)) > 65536) throw new ProvisioningError('request-too-large', 'none')
}
/** No retries; a failed sink revokes only the token just created. No secret appears in receipts or errors. */
export async function provisionAccountToken(request: TokenRequest, bootstrapToken: string, sink: TokenSink, fetcher: typeof fetch = fetch): Promise<Readonly<{ id: string; status: string }>> {
  validate(request)
  if (typeof bootstrapToken !== 'string' || !bootstrapToken || /[\r\n]/.test(bootstrapToken) || typeof sink !== 'function') throw new ProvisioningError('invalid-credential-or-sink', 'none')
  const url = `https://api.cloudflare.com/client/v4/accounts/${request.accountId}/tokens`
  const headers = { Authorization: `Bearer ${bootstrapToken}`, 'Content-Type': 'application/json' }
  let response: Response
  try { response = await fetcher(url, { method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(30000), body: JSON.stringify({ name: request.name, policies: request.policies, ...(request.expiresOn ? { expires_on: request.expiresOn } : {}) }) }) }
  catch { throw new ProvisioningError('create-outcome-unknown', 'unknown') }
  if (!response.ok) throw new ProvisioningError('create-rejected', response.status >= 500 || response.status === 408 ? 'unknown' : 'none')
  let payload: any
  try { const body = await response.text(); if (Buffer.byteLength(body) > 65536) throw new Error(); payload = JSON.parse(body) }
  catch { throw new ProvisioningError('create-response-invalid', 'unknown') }
  const result = payload?.result
  if (payload?.success !== true || !result || !idPattern.test(result.id) || typeof result.value !== 'string' || !result.value || /[\r\n]/.test(result.value)) throw new ProvisioningError('create-response-invalid', 'unknown')
  const tokenId = result.id as string
  try { await sink(result.value, Object.freeze({ id: tokenId })) }
  catch {
    try {
      const deleted = await fetcher(`${url}/${tokenId}`, { method: 'DELETE', headers, redirect: 'error', signal: AbortSignal.timeout(30000) })
      const reply = await deleted.json() as { success?: boolean }
      if (deleted.ok && reply?.success === true) throw new ProvisioningError('secret-sink-failed', 'revoked', tokenId)
    } catch (error) { if (error instanceof ProvisioningError) throw error }
    throw new ProvisioningError('secret-sink-failed', 'revoke-failed', tokenId)
  }
  return Object.freeze({ id: tokenId, status: ['active', 'disabled', 'expired'].includes(result.status) ? result.status : 'unknown' })
}
