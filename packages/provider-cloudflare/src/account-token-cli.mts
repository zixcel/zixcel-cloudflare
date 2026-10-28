#!/usr/bin/env node
/** Local-only candidate provisioning. Never accepts credentials in flags or files. */
import { constants, openSync, fstatSync, readFileSync, closeSync, lstatSync, writeFileSync } from 'node:fs'
import { isAbsolute, dirname } from 'node:path'
import { provisionAccountToken, ProvisioningError } from './account-token-provisioning.mjs'
import { githubEnvironmentSecretSink } from './github-environment-secret.mjs'

function configuration(path: string): { request: Parameters<typeof provisionAccountToken>[0]; target: Parameters<typeof githubEnvironmentSecretSink>[0] } {
  if (!isAbsolute(path)) throw new Error('config-invalid')
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const s = fstatSync(fd)
    if (!s.isFile() || s.nlink !== 1 || s.uid !== process.getuid?.() || (s.mode & 0o077) !== 0 || s.size > 65536) throw new Error('config-permissions')
    const value = JSON.parse(readFileSync(fd, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'request,target') throw new Error('config-invalid')
    if (!value.target || Object.keys(value.target).sort().join(',') !== 'environment,repository,secretName') throw new Error('config-invalid')
    if (!value.request || !['accountId,name,policies', 'accountId,expiresOn,name,policies'].includes(Object.keys(value.request).sort().join(','))) throw new Error('config-invalid')
    return value
  } finally { closeSync(fd) }
}

async function secretFromTerminal(): Promise<string> {
  const input = process.stdin
  if (!input.isTTY || !process.stderr.isTTY) throw new Error('terminal-required')
  input.setRawMode(true); input.resume()
  process.stderr.write('Provisioning token (input hidden): ')
  return await new Promise((resolve, reject) => {
    const bytes: number[] = []
    const finish = (ok: boolean) => {
      input.off('data', onData); input.setRawMode(false); input.pause(); process.stderr.write('\n')
      if (ok && bytes.length) { const token = Buffer.from(bytes).toString('ascii'); bytes.fill(0); resolve(token) }
      else { bytes.fill(0); reject(new Error('token-input-cancelled')) }
    }
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 13 || byte === 10) { finish(true); return }
        if (byte === 3 || byte === 4) { finish(false); return }
        if (byte === 127 || byte === 8) { bytes.pop(); continue }
        if (byte < 33 || byte > 126 || bytes.length >= 512) { finish(false); return }
        bytes.push(byte)
      }
    }
    input.on('data', onData)
  })
}

class DiagnosticError extends Error {
  constructor(readonly phase: 'verify' | 'permission-groups', readonly reason: string, readonly status?: number) { super(reason) }
}

async function inspectAccount(accountId: string, credential: string, output: string): Promise<{ count: number; complete: boolean }> {
  if (!/^[a-f0-9]{32}$/.test(accountId) || !isAbsolute(output)) throw new Error('invalid-inspection')
  const dir = lstatSync(dirname(output))
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid?.() || (dir.mode & 0o077) !== 0) throw new Error('invalid-output-directory')
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens`
  const get = async (suffix: string, phase: 'verify' | 'permission-groups') => {
    let response: Response
    try { response = await fetch(url + suffix, { headers: { Authorization: `Bearer ${credential}` }, redirect: 'error', signal: AbortSignal.timeout(30000) }) }
    catch { throw new DiagnosticError(phase, 'transport-failed') }
    if (!response.ok) throw new DiagnosticError(phase, 'http-rejected', response.status)
    let payload: any
    try {
      const body = await response.text()
      if (Buffer.byteLength(body) > 2097152) throw new Error()
      payload = JSON.parse(body)
    } catch { throw new DiagnosticError(phase, 'invalid-response') }
    if (payload?.success !== true) throw new DiagnosticError(phase, 'api-rejected')
    return payload
  }
  const verified = (await get('/verify', 'verify')).result
  if (verified?.status !== 'active') throw new DiagnosticError('verify', 'token-not-active')
  const groups: any[] = []
  let complete = false
  let expectedTotal: number | undefined
  for (let page = 1; page <= 100; page++) {
    const response = await get(`/permission_groups?page=${page}&per_page=100`, 'permission-groups')
    if (!Array.isArray(response.result) || response.result.length > 100 || groups.length + response.result.length > 10000) throw new DiagnosticError('permission-groups', 'invalid-permission-groups')
    groups.push(...response.result)
    const info = response.result_info
    if (!info || !Number.isSafeInteger(info.total_count) || !Number.isSafeInteger(info.page) || !Number.isSafeInteger(info.per_page) || info.page !== page || info.per_page < 1 || info.per_page > 100) break
    if (info.total_count < 0 || info.total_count > 10000 || (expectedTotal !== undefined && expectedTotal !== info.total_count)) throw new DiagnosticError('permission-groups', 'unstable-permission-groups')
    expectedTotal = info.total_count
    if (groups.length === info.total_count) { complete = true; break }
    if (groups.length > info.total_count) throw new DiagnosticError('permission-groups', 'invalid-permission-groups')
    if (response.result.length === 0) break
  }
  const sanitized = groups.map((g: any) => {
    if (!g || !/^[a-f0-9]{32}$/.test(g.id) || typeof g.name !== 'string' || g.name.length < 1 || g.name.length > 160 || /[\x00-\x1f\x7f]/.test(g.name) || g.name.includes(credential) || !Array.isArray(g.scopes) || g.scopes.length > 20 || g.scopes.some((v: unknown) => typeof v !== 'string' || !/^[\w.*-]{1,160}$/.test(v) || v.includes(credential))) throw new DiagnosticError('permission-groups', 'invalid-permission-group')
    return { id: g.id, name: g.name, scopes: g.scopes, selectable: g.is_selectable === true }
  })
  if (new Set(sanitized.map((g: { id: string }) => g.id)).size !== sanitized.length) throw new DiagnosticError('permission-groups', 'duplicate-permission-group')
  const fd = openSync(output, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { writeFileSync(fd, JSON.stringify({ schema: 'account-token-permissions/v1', complete, groups: sanitized }) + '\n') } finally { closeSync(fd) }
  return { count: sanitized.length, complete }
}

async function main(): Promise<void> {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    console.log('Usage: zix-cloudflare-token /absolute/private/config.json\n       zix-cloudflare-token --inspect /absolute/private/config.json /absolute/private/result.json\nReads the provisioning token invisibly from a terminal.')
    return
  }
  if (process.argv.length === 5 && process.argv[2] === '--inspect') {
    const config = configuration(process.argv[3])
    const credential = await secretFromTerminal()
    const inventory = await inspectAccount(config.request.accountId, credential, process.argv[4])
    console.log(JSON.stringify({ state: 'inspection-complete', groups: inventory.count, inventoryComplete: inventory.complete, effectivePermissions: 'not-verified' }))
    return
  }
  if (process.argv.length !== 3) throw new Error('usage')
  const config = configuration(process.argv[2])
  const sink = githubEnvironmentSecretSink(config.target)
  const credential = await secretFromTerminal()
  const receipt = await provisionAccountToken(config.request, credential, sink)
  console.log(JSON.stringify({ state: 'candidate-stored', tokenId: receipt.id, tokenStatus: receipt.status, effectivePermissions: 'not-verified' }))
}

main().catch(error => {
  const safe = error instanceof DiagnosticError ? { state: 'failed', phase: error.phase, reason: error.reason, ...(error.status !== undefined ? { status: error.status } : {}) } : error instanceof ProvisioningError ? { state: 'failed', reason: error.message, recovery: error.recovery, ...(error.tokenId ? { tokenId: error.tokenId } : {}) } : { state: 'failed', reason: 'local-input-or-execution-failed' }
  console.error(JSON.stringify(safe)); process.exitCode = 1
})
