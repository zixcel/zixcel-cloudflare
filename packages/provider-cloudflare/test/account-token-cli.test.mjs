import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, stat, chmod, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const cli = resolve('dist/account-token-cli.mjs')
const run = path => spawnSync(process.execPath, [cli, path], { encoding:'utf8', timeout:5000 })
test('help describes terminal input and no credential arguments', () => {
  const r = run('--help'); assert.equal(r.status, 0); assert.match(r.stdout, /invisibly from a terminal/)
})
test('requires a private regular owner file and rejects symlinks before any prompt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'token-cli-'))
  try {
    const path = join(dir, 'plan.json'), link = join(dir, 'link')
    const plan = { request:{accountId:'a'.repeat(32),name:'fixture',policies:[]}, target:{repository:'fixture/repo',environment:'production',secretName:'TOKEN_CANDIDATE'} }
    await writeFile(path, JSON.stringify(plan), { mode:0o600 })
    const noTerminal = run(path); assert.equal(noTerminal.status, 1); assert.doesNotMatch(noTerminal.stderr, /Provisioning token/)
    await chmod(path, 0o644)
    const openFile = run(path); assert.equal(openFile.status, 1); assert.doesNotMatch(openFile.stderr, /Provisioning token/)
    await symlink(path, link)
    const symbolic = run(link); assert.equal(symbolic.status, 1); assert.doesNotMatch(symbolic.stderr, /Provisioning token/)
    assert.equal(run('relative.json').status, 1)
  } finally { await rm(dir,{recursive:true,force:true}) }
})
test('rejects unrecognized config fields without displaying their values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'token-cli-'))
  try {
    const path = join(dir,'plan.json'); await writeFile(path, JSON.stringify({ request:{},target:{}, leaked:'synthetic-secret' }), {mode:0o600})
    const result = run(path); assert.equal(result.status,1); assert.doesNotMatch(result.stderr, /synthetic-secret/)
  } finally { await rm(dir,{recursive:true,force:true}) }
})
test('terminal input remains hidden and cancellation performs no provisioning', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'token-cli-'))
  try {
    const path = join(dir,'plan.json')
    await writeFile(path, JSON.stringify({request:{accountId:'a'.repeat(32),name:'fixture',policies:[]},target:{repository:'fixture/repo',environment:'production',secretName:'TOKEN_CANDIDATE'}}), {mode:0o600})
    const code = `import os,pty,select,sys,time\npid,fd=pty.fork()\nif pid==0: os.execv(sys.argv[1],[sys.argv[1],sys.argv[2],sys.argv[3]])\nb=b''\nend=time.monotonic()+5\nwhile b'input hidden' not in b and time.monotonic()<end:\n r,_,_=select.select([fd],[],[],0.2)\n if r:\n  try:b+=os.read(fd,4096)\n  except OSError:break\nif b'input hidden' not in b: os.kill(pid,9);sys.exit(2)\nos.write(fd,b'synthetic-private-value'+bytes([3]))\nwhile time.monotonic()<end:\n r,_,_=select.select([fd],[],[],0.2)\n if r:\n  try:b+=os.read(fd,4096)\n  except OSError:break\n_,status=os.waitpid(pid,0)\nsys.exit(0 if b'synthetic-private-value' not in b and os.waitstatus_to_exitcode(status)==1 else 3)`
    const result = spawnSync('python3',['-c', code, process.execPath, cli, path],{encoding:'utf8',timeout:7000})
    assert.equal(result.status,0,`terminal fixture failed: ${result.status}`)
  } finally { await rm(dir,{recursive:true,force:true}) }
})
test('inspection performs bounded reads and writes private metadata without the credential', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'token-inspection-'))
  try {
    const config = join(dir,'plan.json'), output = join(dir,'groups.json'), fixture = join(dir,'fetch.mjs')
    await writeFile(config, JSON.stringify({request:{accountId:'a'.repeat(32),name:'fixture',policies:[]},target:{repository:'fixture/repo',environment:'production',secretName:'TOKEN_CANDIDATE'}}), {mode:0o600})
    await writeFile(fixture, `globalThis.fetch=async(url,init)=>{if(init.method || init.headers.Authorization!=='Bearer synthetic-private-value')throw Error('fixture failure');return new Response(JSON.stringify({success:true,result:url.endsWith('/verify')?{status:'active'}:[{id:'b'.repeat(32),name:'Workers Read',scopes:['com.cloudflare.api.account'],is_selectable:true}],result_info:{total_count:1,page:1,per_page:100}}))}`)
    const code = `import os,pty,select,sys,time\npid,fd=pty.fork()\nif pid==0:os.execv(sys.argv[1],[sys.argv[1],'--import',sys.argv[2],sys.argv[3],'--inspect',sys.argv[4],sys.argv[5]])\nb=b'';end=time.monotonic()+5\nwhile b'input hidden' not in b and time.monotonic()<end:\n r,_,_=select.select([fd],[],[],0.2)\n if r:\n  try:b+=os.read(fd,4096)\n  except OSError:break\nif b'input hidden' not in b:os.kill(pid,9);sys.exit(2)\nos.write(fd,b'synthetic-private-value\\n')\nwhile time.monotonic()<end:\n r,_,_=select.select([fd],[],[],0.2)\n if r:\n  try:b+=os.read(fd,4096)\n  except OSError:break\n_,status=os.waitpid(pid,0)\nsys.exit(0 if b'synthetic-private-value' not in b and os.waitstatus_to_exitcode(status)==0 else 3)`
    const result = spawnSync('python3',['-c',code,process.execPath,fixture,cli,config,output],{encoding:'utf8',timeout:7000})
    assert.equal(result.status,0,`fixture failed: ${result.status}`)
    const bytes = await readFile(output,'utf8'); assert.doesNotMatch(bytes,/synthetic-private-value/)
    assert.equal(JSON.parse(bytes).groups[0].selectable,true); assert.equal(JSON.parse(bytes).complete,true); assert.equal((await stat(output)).mode & 0o777,0o600)
  } finally { await rm(dir,{recursive:true,force:true}) }
})
test('reports safe phase and status for a denied request without exposing response or token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'token-diagnostic-'))
  try {
    const config = join(dir,'plan.json'), output = join(dir,'groups.json'), fixture = join(dir,'fetch.mjs')
    await writeFile(config, JSON.stringify({request:{accountId:'a'.repeat(32),name:'fixture',policies:[]},target:{repository:'fixture/repo',environment:'production',secretName:'TOKEN_CANDIDATE'}}), {mode:0o600})
    await writeFile(fixture, `globalThis.fetch=async()=>new Response('synthetic-private-value',{status:403})`)
    const code = `import os,pty,select,sys,time\npid,fd=pty.fork()\nif pid==0:os.execv(sys.argv[1],[sys.argv[1],'--import',sys.argv[2],sys.argv[3],'--inspect',sys.argv[4],sys.argv[5]])\nb=b'';end=time.monotonic()+5\nwhile b'input hidden' not in b and time.monotonic()<end:\n r,_,_=select.select([fd],[],[],0.2)\n if r:\n  try:b+=os.read(fd,4096)\n  except OSError:break\nif b'input hidden' not in b:os.kill(pid,9);sys.exit(2)\nos.write(fd,b'synthetic-private-value\\n')\nwhile time.monotonic()<end:\n r,_,_=select.select([fd],[],[],0.2)\n if r:\n  try:b+=os.read(fd,4096)\n  except OSError:break\n_,status=os.waitpid(pid,0)\nsys.exit(0 if b'synthetic-private-value' not in b and b'"phase":"verify"' in b and b'"status":403' in b and os.waitstatus_to_exitcode(status)==1 else 3)`
    const result = spawnSync('python3',['-c',code,process.execPath,fixture,cli,config,output],{encoding:'utf8',timeout:7000})
    assert.equal(result.status,0,`fixture failed: ${result.status}`)
  } finally { await rm(dir,{recursive:true,force:true}) }
})
