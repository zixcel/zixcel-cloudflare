import test from 'node:test'
import assert from 'node:assert/strict'
import {handle} from '../src/worker.mjs'
import {boundedText, submission} from '../src/body.mjs'
import {networkAllowed,validateNetwork} from '../src/network.mjs'
import {ContactReceipts} from '../src/receipts.mjs'

const policy=()=>({allowedCidrs:[],deniedCidrs:[],allowedCountries:[],deniedCountries:[],deniedRegions:[],deniedAsns:[]})
const valid=()=>({siteKey:'hat-corporate',email:'person@example.com',subject:'Question',message:'Hello <script>not executable</script>',turnstileToken:'test-token',submissionId:crypto.randomUUID(),policyVersion:'urn:coela:legal:organization:hat-inc:privacy-policy@'+'a'.repeat(40)})
function fixture(){
 const site={siteKey:'hat-corporate',origin:'https://hat-tech.co.jp',hostname:'hat-tech.co.jp',to:'contact@hat-tech.co.jp',from:'forms@notify.example.com',policyVersion:valid().policyVersion,enabled:true,network:policy()}
 const calls={limit:0,verify:0,reserve:0,email:[]};const reserved=new Set()
 const env={SITES_JSON:JSON.stringify([site]),TURNSTILE_SECRET:'secret',IP_KEY_SECRET:'s'.repeat(32),LIMITER:{async limit(v){calls.limit++;assert.ok(!v.key.includes('203.0.113.9'));return {success:true}}},RECEIPTS:{async reserve(v){calls.reserve++;if(reserved.has(v.key))return false;reserved.add(v.key);return true}},EMAIL:{async send(v){calls.email.push(v);return {messageId:'provider-id'}}}}
 const token={success:true,hostname:site.hostname,action:'contact',challenge_ts:new Date().toISOString()}
 const fetcher=async(url,opts)=>{calls.verify++;assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(opts.redirect,'error');assert.deepEqual(Object.keys(JSON.parse(opts.body)).sort(),['response','secret']);return Response.json(token)}
 const request=(data=valid(),options={})=>{const req=new Request('https://contact.example.com/v1/submissions',{method:'POST',headers:{origin:site.origin,'content-type':'application/json','cf-connecting-ip':'203.0.113.9'},body:JSON.stringify(data),...options});Object.defineProperty(req,'cf',{value:{country:'JP',regionCode:'13',asn:64500}});return req}
 const update=()=>env.SITES_JSON=JSON.stringify([site])
 return {site,calls,env,token,fetcher,request,update}
}

test('accepted provider request uses configured destination, plain text and fixed subject',async()=>{
 const f=fixture();const res=await handle(f.request(),f.env,f.fetcher)
 assert.equal(res.status,202);assert.equal((await res.json()).code,'accepted_by_provider');assert.equal(f.calls.email.length,1)
 const msg=f.calls.email[0];assert.equal(msg.to,'contact@hat-tech.co.jp');assert.equal(msg.replyTo,'person@example.com');assert.equal(msg.subject,'Website contact: hat-corporate');assert.ok(!('html' in msg));assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('access-control-allow-origin'),f.site.origin)
})
for(const [label,change,status] of [
 ['disabled site',f=>{f.site.enabled=false;f.update()},403],
 ['missing limiter',f=>delete f.env.LIMITER,503],
 ['missing atomic receipts',f=>delete f.env.RECEIPTS,503],
 ['missing email',f=>delete f.env.EMAIL,503],
 ['missing secret',f=>delete f.env.TURNSTILE_SECRET,503],
 ['invalid config',f=>{f.env.SITES_JSON='{}'},503],
 ['denied country',f=>{f.site.network.deniedCountries=['JP'];f.update()},403],
 ['denied region',f=>{f.site.network.deniedRegions=[{country:'JP',region:'13'}];f.update()},403],
 ['denied ASN',f=>{f.site.network.deniedAsns=[64500];f.update()},403],
 ['denied CIDR',f=>{f.site.network.deniedCidrs=['203.0.113.0/24'];f.update()},403],
 ['outside allowed CIDR',f=>{f.site.network.allowedCidrs=['198.51.100.0/24'];f.update()},403],
 ['deny overrides allow',f=>{f.site.network.allowedCidrs=['203.0.113.0/24'];f.site.network.deniedCidrs=['203.0.113.9/32'];f.update()},403]
])test(label+' never reaches verification or mail',async()=>{const f=fixture();change(f);assert.equal((await handle(f.request(),f.env,f.fetcher)).status,status);assert.equal(f.calls.verify,0);assert.equal(f.calls.email.length,0)})
for(const [label,patch] of [
 ['header injection',{subject:'Hello\r\nBcc: victim@example.com'}],['multiple email recipients',{email:'a@example.com,b@example.com'}],['display mailbox',{email:'Person <a@example.com>'}],['recipient override',{to:'other@example.com'}],['unknown site',{siteKey:'other'}],['old privacy version',{policyVersion:'old'}],['oversized message',{message:'x'.repeat(5001)}],['control bytes',{message:'bad\u0000'}]
])test(label+' rejected before external verification',async()=>{const f=fixture();assert.equal((await handle(f.request({...valid(),...patch}),f.env,f.fetcher)).status,400);assert.equal(f.calls.verify,0);assert.equal(f.calls.email.length,0)})
for(const [name,patch]of[['wrong hostname',{hostname:'other.example'}],['wrong action',{action:'login'}],['failed verification',{success:false}],['expired token',{challenge_ts:new Date(Date.now()-301000).toISOString()}],['missing timestamp',{challenge_ts:null}]])test(name+' never reaches receipt or mail',async()=>{const f=fixture();Object.assign(f.token,patch);assert.equal((await handle(f.request(),f.env,f.fetcher)).status,403);assert.equal(f.calls.reserve,0);assert.equal(f.calls.email.length,0)})
test('origin, media type, method and query checks',async()=>{
 const f=fixture()
 assert.equal((await handle(f.request(valid(),{headers:{origin:'https://evil.example'}}),f.env,f.fetcher)).status,403)
 assert.equal((await handle(f.request(valid(),{headers:{origin:f.site.origin,'content-type':'text/plain'}}),f.env,f.fetcher)).status,415)
 for(const method of ['GET','HEAD']){const r=new Request('https://contact.example.com/v1/submissions',{method,headers:{origin:f.site.origin}});assert.equal((await handle(r,f.env,f.fetcher)).status,405)}
 assert.equal((await handle(new Request('https://contact.example.com/v1/submissions?email=secret'),f.env,f.fetcher)).status,404)
 assert.equal(f.calls.email.length,0)
})
test('missing Cloudflare metadata and spoofed client geolocation fail closed',async()=>{
 const f=fixture();const r=new Request('https://contact.example.com/v1/submissions',{method:'POST',headers:{origin:f.site.origin,'content-type':'application/json','cf-connecting-ip':'203.0.113.9','cf-ipcountry':'JP'},body:JSON.stringify(valid())});assert.equal((await handle(r,f.env,f.fetcher)).status,403)
})
test('rate limited request cannot reach verifier',async()=>{const f=fixture();f.env.LIMITER.limit=async()=>({success:false});assert.equal((await handle(f.request(),f.env,f.fetcher)).status,429);assert.equal(f.calls.verify,0)})
test('duplicate ID and unknown delivery are never automatically resent',async()=>{
 const f=fixture();const input=valid();f.env.EMAIL.send=async v=>{f.calls.email.push(v);throw Error('provider exception containing private data')}
 const first=await handle(f.request(input),f.env,f.fetcher);assert.equal(first.status,503);assert.equal((await first.json()).code,'outcome_unknown_do_not_resend')
 assert.equal((await handle(f.request(input),f.env,f.fetcher)).status,409);assert.equal(f.calls.email.length,1)
})
test('preflight permits only exact origin, POST and content-type',async()=>{
 const f=fixture();const req=headers=>new Request('https://contact.example.com/v1/submissions',{method:'OPTIONS',headers:{origin:f.site.origin,'access-control-request-method':'POST',...headers}})
 assert.equal((await handle(req({'access-control-request-headers':'content-type'}),f.env)).status,204)
 assert.equal((await handle(req({'access-control-request-headers':'authorization'}),f.env)).status,403);assert.equal(f.calls.email.length,0)
})
test('streaming limits apply without content-length and cancel overrun',async()=>{
 let canceled=false;const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(20))},cancel(){canceled=true}})
 await assert.rejects(()=>boundedText(body,10));assert.equal(canceled,true)
})
test('IPv6, mapped IPv4, allow/deny precedence and absent optional geo',()=>{
 const p=policy();validateNetwork(p);assert.equal(networkAllowed({},'2001:db8::1',p),true)
 p.deniedCidrs=['2001:db8::/32','203.0.113.0/24'];assert.equal(networkAllowed({},'2001:db8::1',p),false);assert.equal(networkAllowed({},'::ffff:203.0.113.9',p),false)
 p.deniedCountries=['JP'];assert.equal(networkAllowed({},'198.51.100.1',p),false)
 assert.throws(()=>validateNetwork({...policy(),deniedCidrs:['invalid']}))
})
test('concurrent reservation is at most once, expiration removes metadata',async()=>{
 let reserved=false;let lock=Promise.resolve();let alarm=0
 const state={storage:{transaction(fn){const job=lock.then(()=>fn({get:async()=>reserved,put:async()=>{reserved=true}}));lock=job.catch(()=>{});return job},async setAlarm(x){alarm=x},async deleteAll(){reserved=false}}}
 const gate=new ContactReceipts(state);const results=await Promise.all(Array.from({length:12},()=>gate.fetch(new Request('https://internal/',{method:'POST'}))))
 assert.equal(results.filter(x=>x.status===201).length,1);assert.ok(alarm>Date.now());await gate.alarm();assert.equal(reserved,false)
})

test('invalid policy and misspelled network settings cannot silently enable sending',async()=>{
 const f=fixture();f.site.policyVersion='latest';f.update();assert.equal((await handle(f.request(),f.env,f.fetcher)).status,503);assert.equal(f.calls.email.length,0)
 assert.throws(()=>validateNetwork({...policy(),deniedIPs:['203.0.113.9']}))
 assert.throws(()=>validateNetwork({...policy(),deniedCidrs:['::ffff:203.0.113.0/120']}))
})
