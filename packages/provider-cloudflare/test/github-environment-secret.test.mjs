import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { githubEnvironmentSecretSink } from '../dist/github-environment-secret.mjs'
test('passes a secret on stdin and exact target as argument values, without shell', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fake-secret-store-'))
  try {
    const executable = join(dir, 'fake-gh'), output = join(dir, 'observation')
    await writeFile(executable, `#!/usr/bin/env node\nconst c=require('node:crypto');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>require('node:fs').writeFileSync(${JSON.stringify(output)},JSON.stringify({args:process.argv.slice(2),digest:c.createHash('sha256').update(s).digest('hex')})));\n`)
    await chmod(executable, 0o700)
    const sink = githubEnvironmentSecretSink({ repository:'example/site', environment:'production', secretName:'TOKEN_CANDIDATE', ghPath: executable })
    await sink('synthetic-secret', { id:'a'.repeat(32) })
    const observed = JSON.parse(await readFile(output, 'utf8'))
    assert.deepEqual(observed.args, ['secret','set','TOKEN_CANDIDATE','--repo','example/site','--env','production'])
    assert.equal(observed.digest, (await import('node:crypto')).createHash('sha256').update('synthetic-secret').digest('hex'))
    assert.ok(!JSON.stringify(observed).includes('synthetic-secret'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test('rejects injection and missing executable without exposing the secret', async () => {
  assert.throws(() => githubEnvironmentSecretSink({ repository:'example/site;command', environment:'production', secretName:'TOKEN_CANDIDATE' }), /invalid-secret-target/)
  const sink = githubEnvironmentSecretSink({ repository:'example/site', environment:'production', secretName:'TOKEN_CANDIDATE', ghPath:'/nonexistent/gh' })
  await assert.rejects(sink('synthetic-secret', { id:'a'.repeat(32) }), error => !error.message.includes('synthetic-secret'))
})
