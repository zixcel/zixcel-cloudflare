import { spawn } from 'node:child_process'
import type { TokenSink } from './account-token-provisioning.mjs'

/** Trusted local GitHub CLI secret sink. gh receives the value on stdin, never argv. */
export function githubEnvironmentSecretSink(options: { repository: string; environment: string; secretName: string; ghPath?: string }): TokenSink {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository) || !/^[A-Za-z0-9_.-]{1,120}$/.test(options.environment) || !/^[A-Z][A-Z0-9_]{0,89}_CANDIDATE$/.test(options.secretName) || (options.ghPath !== undefined && (!options.ghPath.startsWith('/') || /[\r\n\0]/.test(options.ghPath)))) throw new Error('invalid-secret-target')
  const args = ['secret', 'set', options.secretName, '--repo', options.repository, '--env', options.environment]
  return async (secret: string) => {
    if (!secret || /[\r\n]/.test(secret)) throw new Error('invalid-secret')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(options.ghPath ?? 'gh', args, { shell: false, stdio: ['pipe', 'ignore', 'ignore'] })
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('secret-store-outcome-unknown')) }, 30000)
      child.once('error', () => { clearTimeout(timer); reject(new Error('secret-store-outcome-unknown')) })
      child.stdin.once('error', () => { clearTimeout(timer); reject(new Error('secret-store-outcome-unknown')) })
      child.once('close', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error('secret-store-outcome-unknown')) })
      child.stdin.end(secret)
    })
  }
}
