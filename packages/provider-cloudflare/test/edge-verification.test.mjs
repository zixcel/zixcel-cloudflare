import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { edgeScriptDigest, originHtml, validateEdgePins } from '../dist/edge-verification.mjs'
const source = Buffer.from('<html><body><main>Approved</main></body></html>')
const analytics = Buffer.from('<script src="https://static.cloudflareinsights.com/beacon.min.js/fixture"></script>')
const jsd = Buffer.from("<script>window.__CF$cv$params={r:'0123456789abcdef',t:'MTc5Mjc0MTE4Mw=='};fixture();</script>")
const pins = { analytics: edgeScriptDigest(analytics), jsd: edgeScriptDigest(jsd) }
const inserted = (tags, original = source) => Buffer.from(original.toString().replace('</body>', tags + '</body>'))
test('exact complete pins work in either order and preserve non-UTF8 bytes', () => {
  for (const tags of [analytics + '\n' + jsd, jsd + analytics + '\n']) assert.deepEqual(originHtml(inserted(tags), pins), source)
  const binary = Buffer.concat([Buffer.from([0xff]), source])
  assert.deepEqual(originHtml(Buffer.from(binary.toString('latin1').replace('</body>', analytics + '</body>'), 'latin1'), pins), binary)
})
test('only ray ID and canonical numeric timestamp vary; code or nonnumeric changes never match', () => {
  assert.equal(edgeScriptDigest(Buffer.from(jsd.toString().replace('0123456789abcdef', 'fedcba9876543210').replace('MTc5Mjc0MTE4Mw==', 'MTc5Mjc0MTE4NA=='))), pins.jsd)
  for (const changed of [jsd.toString().replace('fixture()', 'evil()'), jsd.toString().replace('MTc5Mjc0MTE4Mw==', 'ZXZpbCgpOw==')]) assert.notDeepEqual(originHtml(inserted(changed), pins), source)
})
test('duplicates, unknown script, changed body or other position remain a byte mismatch', () => {
  for (const tags of [analytics + analytics, jsd + jsd, analytics + jsd + '<script>evil()</script>', analytics.toString().replace('fixture', 'unknown')]) assert.notDeepEqual(originHtml(inserted(tags), pins), source)
  assert.notDeepEqual(originHtml(inserted(analytics, Buffer.from(source.toString().replace('Approved', 'Changed'))), pins), source)
  assert.notDeepEqual(originHtml(Buffer.from(source.toString().replace('<body>', '<body>' + analytics)), pins), source)
  assert.deepEqual(originHtml(inserted(analytics), {}), inserted(analytics))
})
test('closed distinct pin roles and budgets are enforced', () => {
  for (const value of [[], { unknown: 'a'.repeat(64) }, { jsd: '*' }, { jsd: 'a'.repeat(64), analytics: 'a'.repeat(64) }]) assert.throws(() => validateEdgePins(value))
  assert.equal(edgeScriptDigest(Buffer.alloc(8193)), undefined)
  const large = Buffer.alloc(8 * 1024 * 1024 + 1, 'x'); assert.deepEqual(originHtml(large, pins), large)
  assert.equal(createHash('sha256').update(originHtml(inserted(analytics), pins)).digest('hex'), createHash('sha256').update(source).digest('hex'))
})
