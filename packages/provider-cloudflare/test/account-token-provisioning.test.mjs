import test from 'node:test'
import assert from 'node:assert/strict'
import { provisionAccountToken } from '../dist/account-token-provisioning.mjs'
const account = 'a'.repeat(32), group = 'b'.repeat(32), createdId = 'c'.repeat(32)
const bootstrap = 'fixture-bootstrap-secret', secret = 'fixture-created-secret'
const request = { accountId: account, name: 'Fixture token', policies: [{ effect: 'allow', permission_groups: [{ id: group }], resources: { [`com.cloudflare.api.account.${account}`]: '*' } }] }
const issued = () => new Response(JSON.stringify({ success: true, result: { id: createdId, value: secret, status: 'active' } }))
test('creates once and passes secret to trusted sink without exposing it in receipt', async () => {
  const calls = []
  const result = await provisionAccountToken(request, bootstrap, async (value, metadata) => { assert.equal(value, secret); assert.deepEqual(metadata, { id: createdId }) }, async (url, init) => { calls.push({ url, init }); return issued() })
  assert.deepEqual(result, { id: createdId, status: 'active' })
  assert.equal(calls.length, 1); assert.equal(calls[0].init.redirect, 'error')
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${bootstrap}`)
  assert.ok(!JSON.stringify(result).includes(secret)); assert.ok(!JSON.stringify(result).includes(bootstrap))
})
test('invalid policies stop before network', async () => {
  let called = false
  await assert.rejects(provisionAccountToken({ ...request, policies: [] }, bootstrap, async () => {}, async () => { called = true }), /invalid-request/)
  assert.equal(called, false)
})
test('sink failure revokes only new token and suppresses secrets and error bodies', async () => {
  const calls = []
  const fetcher = async (url, init) => { calls.push([url, init.method]); return init.method === 'POST' ? issued() : new Response('{"success":true}') }
  await assert.rejects(provisionAccountToken(request, bootstrap, async () => { throw new Error(secret) }, fetcher), e => e.message === 'secret-sink-failed' && e.recovery === 'revoked' && e.tokenId === createdId && !JSON.stringify(e).includes(secret))
  assert.deepEqual(calls.map(x => x[1]), ['POST', 'DELETE']); assert.ok(calls[1][0].endsWith('/' + createdId))
})
test('reports failed cleanup and ambiguous creation for manual recovery; no retry', async () => {
  let calls = 0
  await assert.rejects(provisionAccountToken(request, bootstrap, async () => { throw Error() }, async (_url, init) => { calls++; return init.method === 'POST' ? issued() : new Response('{}', {status:403}) }), e => e.recovery === 'revoke-failed' && e.tokenId === createdId)
  assert.equal(calls, 2); calls = 0
  await assert.rejects(provisionAccountToken(request, bootstrap, async () => {}, async () => { calls++; throw new Error(bootstrap) }), e => e.recovery === 'unknown' && !e.message.includes(bootstrap))
  assert.equal(calls, 1)
})
test('malformed successful response is ambiguous and does not invoke sink', async () => {
  let called = false
  await assert.rejects(provisionAccountToken(request, bootstrap, async () => { called = true }, async () => new Response('{"success":true,"result":{}}')), e => e.recovery === 'unknown')
  assert.equal(called, false)
})
