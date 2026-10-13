import assert from 'node:assert/strict'
import test from 'node:test'
import { createControl } from '../dist/index.mjs'
const account = { provider: 'cloudflare', account: 'synthetic-account', subject: 'synthetic-owner' }
async function receipt(body) {
  const control = createControl(account, { acquire: async () => 'synthetic-never-real-credential' },
    async () => new Response(JSON.stringify(body)))
  const plan = control.prepare('billing.profile-read', {})
  return control.execute(control.approve(plan, Date.now() + 10000).id, plan)
}
test('billing profiles do not expose payment nonces, validation codes or unreviewed fields', async () => {
  const observed = await receipt({ success: true, result: { company: 'Synthetic', state: 'active',
    payment_nonce: 'synthetic-sensitive-nonce', validation_code: 'synthetic-sensitive-code', unreviewed: 'synthetic-private' } })
  assert.deepEqual(observed.data.fields, { company: 'Synthetic', state: 'active' })
  assert.ok(!JSON.stringify(observed).includes('synthetic-sensitive'))
  assert.equal(observed.data.sourceDigest, undefined)
})
test('HTTP success without a valid successful vendor envelope is not a billing observation', async () => {
  for (const body of [{ success: false }, { success: true, result: [] }, { success: true, result: { company: 1 } }]) {
    await assert.rejects(receipt(body), /unavailable/)
  }
})
