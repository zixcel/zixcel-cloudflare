#!/usr/bin/env node
/** Local-only candidate provisioning. Never accepts credentials in flags or files. */
import { constants, openSync, fstatSync, readFileSync, closeSync } from 'node:fs'
import { isAbsolute } from 'node:path'
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

async function main(): Promise<void> {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    console.log('Usage: zix-cloudflare-token /absolute/private/config.json\nCreates one candidate secret. The provisioning token is read invisibly from a terminal.')
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
  const safe = error instanceof ProvisioningError ? { state: 'failed', reason: error.message, recovery: error.recovery, ...(error.tokenId ? { tokenId: error.tokenId } : {}) } : { state: 'failed', reason: 'local-input-or-execution-failed' }
  console.error(JSON.stringify(safe)); process.exitCode = 1
})
