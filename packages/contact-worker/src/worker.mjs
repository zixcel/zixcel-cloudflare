import { boundedText, submission } from './body.mjs'
import { networkAllowed, validateNetwork } from './network.mjs'

/** @typedef {import('./types.js').Site} Site */
/** @typedef {import('./types.js').Env} Env */
/** @typedef {import('./types.js').EdgeRequest} EdgeRequest */
/** @param {number} status @param {string} code @param {string|null} [origin] @param {Record<string,string>} [extra] */
function reply(status,code,origin=null,extra={}) {
  return new Response(JSON.stringify({code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'",'vary':'Origin',...(origin?{'access-control-allow-origin':origin}:{}),...extra}})
}
/** @template T @param {Promise<T>} promise @param {number} ms */
async function deadline(promise,ms){let timer=/** @type {ReturnType<typeof setTimeout>|undefined} */(undefined);try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('deadline')),ms)})])}finally{clearTimeout(timer)}}
/** @param {Env} env */
export function validateSites(env){
 if(new TextEncoder().encode(env.SITES_JSON||'').byteLength>5120)throw Error('configuration_too_large')
 const list=JSON.parse(env.SITES_JSON||'null')
 if(!Array.isArray(list)||!list.length||list.length>100)throw Error('invalid_sites')
 const keys=new Set();const origins=new Set()
 for(const s of list){
  if(!s||Object.keys(s).sort().join(',')!=='enabled,from,hostname,network,origin,policyVersion,siteKey,to'||typeof s.enabled!=='boolean'||typeof s.siteKey!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(s.siteKey)||typeof s.policyVersion!=='string'||!s.policyVersion||s.policyVersion.length>160)throw Error('invalid_site')
  if(s.enabled && !/^urn:coela:legal:[A-Za-z0-9:.\-]+@[0-9a-f]{40}$/.test(s.policyVersion))throw Error('unpinned_policy')
  const url=new URL(s.origin)
  if(url.protocol!=='https:'||url.origin!==s.origin||url.hostname!==s.hostname||keys.has(s.siteKey)||origins.has(s.origin))throw Error('invalid_site')
  for(const address of [s.to,s.from])if(typeof address!=='string'||!/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(address))throw Error('invalid_address')
  validateNetwork(s.network);keys.add(s.siteKey);origins.add(s.origin)
 }
 return /** @type {Site[]} */(list)
}
/** HMAC avoids putting raw addresses in counter keys. Not anonymous data.
 * @param {string} secret @param {string} ip */
async function ipKey(secret,ip){const enc=new TextEncoder();const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(ip))),x=>x.toString(16).padStart(2,'0')).join('')}
/** No body, token, email or exception text is logged. No request retry is performed.
 * @param {EdgeRequest} request @param {Env} env @param {typeof fetch} [externalFetch] */
export async function handle(request,env,externalFetch=fetch){
 let origin=null
 try{
  const url=new URL(request.url)
  if(url.protocol!=='https:'||url.pathname!=='/v1/submissions'||url.search)return reply(404,'not_found')
  const list=validateSites(env);const site=list.find(s=>s.origin===request.headers.get('origin'))
  if(!site)return reply(403,'submission_unavailable')
  origin=site.origin
  if(request.method==='OPTIONS'){
   const headers=(request.headers.get('access-control-request-headers')||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean)
   if(request.headers.get('access-control-request-method')!=='POST'||headers.some(x=>x!=='content-type'))return reply(403,'submission_unavailable',origin)
   return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type','cache-control':'no-store','vary':'Origin'}})
  }
  if(request.method!=='POST')return reply(405,'method_not_allowed',origin,{'allow':'POST, OPTIONS'})
  if(!site.enabled)return reply(403,'submission_unavailable',origin)
  if(!env.TURNSTILE_SECRET||!env.IP_KEY_SECRET||env.IP_KEY_SECRET.length<32||!env.LIMITER||!env.RECEIPTS||!env.EMAIL)return reply(503,'submission_unavailable',origin)
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||'')||request.headers.has('content-encoding'))return reply(415,'unsupported_media_type',origin)
  if(request.headers.has('content-length')&&!/^\d+$/.test(request.headers.get('content-length')||''))return reply(400,'invalid_submission',origin)
  if(Number(request.headers.get('content-length'))>24576)return reply(413,'invalid_submission',origin)
  const ip=request.headers.get('cf-connecting-ip')
  const cf=request.cf
  if(!cf)return reply(403,'submission_unavailable',origin)
  if(!networkAllowed(cf,ip,site.network))return reply(403,'submission_unavailable',origin)
  const key=await ipKey(env.IP_KEY_SECRET,/** @type {string} */(ip))
  const allowed=await deadline(env.LIMITER.limit({key:site.siteKey+':'+key}),2000)
  if(!allowed.success)return reply(429,'rate_limited',origin)
  let input
  try{input=submission(JSON.parse(await deadline(boundedText(request.body),3000)))}catch{return reply(400,'invalid_submission',origin)}
  if(input.siteKey!==site.siteKey||input.policyVersion!==site.policyVersion)return reply(400,'invalid_submission',origin)
  // Siteverify gets the token only; email/subject/body are never sent there.
  const check=await externalFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET,response:input.turnstileToken}),signal:AbortSignal.timeout(4000)})
  if(!check.ok)return reply(503,'submission_unavailable',origin)
  let token
  try{token=JSON.parse(await boundedText(check.body,8192))}catch{return reply(503,'submission_unavailable',origin)}
  const age=Date.now()-Date.parse(token.challenge_ts)
  if(token.success!==true||token.hostname!==site.hostname||token.action!=='contact'||!Number.isFinite(age)||age< -30000||age>300000)return reply(403,'verification_failed',origin)
  // Binding must atomically reserve across locations and expire IDs after the documented window.
  // Missing or failed reservation never starts mail delivery.
  if(!await deadline(env.RECEIPTS.reserve({key:site.siteKey+':'+input.submissionId,ttlSeconds:86400}),2000))return reply(409,'already_submitted',origin)
  try{
   const sent=await deadline(env.EMAIL.send({to:site.to,from:site.from,replyTo:input.email,subject:'Website contact: '+site.siteKey,text:'Receipt: '+input.submissionId+'\nPolicy: '+input.policyVersion+'\nSubject: '+input.subject+'\n\n'+input.message}),6000)
   if(!sent||typeof sent.messageId!=='string'||!sent.messageId)return reply(503,'outcome_unknown_do_not_resend',origin)
  }catch{return reply(503,'outcome_unknown_do_not_resend',origin)}
  // Provider acceptance only, not inbox-delivery confirmation.
  return reply(202,'accepted_by_provider',origin)
 }catch{return reply(503,'submission_unavailable',origin)}
}
