// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Coela. Adapted for the Zixcel Cloudflare owner, 2026.
// Derived from coela-oss/portfolio site_release.py at 79f9c73596bd288b66d3e72ffbc22a382ee0c21b.
import { createHash } from 'node:crypto'
export interface EdgePins { analytics?: string; jsd?: string }
export function validateEdgePins(input: unknown): EdgePins {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid edge pins')
  const entries = Object.entries(input)
  if (entries.some(([key, value]) => !['analytics', 'jsd'].includes(key)
    || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    || new Set(entries.map(([, value]) => value)).size !== entries.length) throw Error('Invalid edge pins')
  return input as EdgePins
}
export function edgeScriptDigest(bytes: Uint8Array): string | undefined {
  if (bytes.byteLength > 8192) return undefined
  let tag = Buffer.from(bytes).toString('latin1')
  const pattern = /window\.__CF\$cv\$params=\{r:'([a-f0-9]{16})',t:'([A-Za-z0-9+/]{8,32}={0,2})'\};/g
  const matches = [...tag.matchAll(pattern)]
  if (matches.length) {
    if (matches.length !== 1) return undefined
    const encoded = matches[0]![2]!, stamp = Buffer.from(encoded, 'base64')
    if (stamp.toString('base64') !== encoded || !/^[0-9]{10,12}$/.test(stamp.toString('latin1'))) return undefined
    tag = tag.replace(pattern, "window.__CF$cv$params={r:'RAY_ID',t:'TIMESTAMP'};")
  }
  return createHash('sha256').update(Buffer.from(tag, 'latin1')).digest('hex')
}
/** Only exact pinned end-of-body tags can be removed. No script is executed.
 * The caller must still compare every remaining byte with its admitted artifact. */
export function originHtml(bytes: Uint8Array, input: unknown): Buffer {
  const pins = validateEdgePins(input), data = Buffer.from(bytes)
  if (!Object.keys(pins).length || data.length > 8 * 1024 * 1024) return data
  const text = data.toString('latin1'), split = text.lastIndexOf('</body>')
  if (split < 0) return data
  let head = text.slice(0, split)
  const seen = new Set<string>()
  for (let i = 0; i < 2; i++) {
    const probe = head.endsWith('\n') ? head.slice(0, -1) : head, start = probe.lastIndexOf('<script')
    if (start < 0) break
    const tag = probe.slice(start)
    if (tag.length > 8192 || !/^<script\b[^>]*>[\s\S]*?<\/script>$/.test(tag)) break
    const digest = edgeScriptDigest(Buffer.from(tag, 'latin1'))
    const kinds = Object.entries(pins).filter(([, value]) => value === digest).map(([key]) => key)
    if (kinds.length !== 1 || seen.has(kinds[0]!)) break
    seen.add(kinds[0]!); head = probe.slice(0, start)
  }
  return Buffer.from(head + text.slice(split), 'latin1')
}
