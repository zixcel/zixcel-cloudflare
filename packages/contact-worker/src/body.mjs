export const MAX_BODY_BYTES=24_576
/** @param {ReadableStream<Uint8Array>|null} body @param {number} [limit] */
export async function boundedText(body,limit=MAX_BODY_BYTES){
  if(!body)throw Error('missing_body')
  const reader=body.getReader();let expired=false;const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>{})},3000);const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0;let text=''
  try{for(;;){const {done,value}=await reader.read();if(expired)throw Error('body_timeout');if(done)break;bytes+=value.byteLength;if(bytes>limit)throw Error('body_too_large');text+=decoder.decode(value,{stream:true})}return text+decoder.decode()}
  finally{clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock()}
}
/** @param {unknown} input */
export function submission(input){
  if(!input || typeof input!=='object'||Array.isArray(input))throw Error('invalid_submission')
  const v=/** @type {Record<string,unknown>} */(input)
  const keys=['siteKey','email','subject','message','turnstileToken','submissionId','policyVersion']
  if(Object.keys(v).length!==keys.length || keys.some(k=>typeof v[k]!=='string'))throw Error('invalid_submission')
  const s=/** @type {{siteKey:string,email:string,subject:string,message:string,turnstileToken:string,submissionId:string,policyVersion:string}} */(v)
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(s.siteKey)||!/^\S[^\r\n\u0000-\u001f\u007f]{0,149}$/.test(s.subject)||!s.subject.trim()||s.message.length>5000||!s.message.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s.message))throw Error('invalid_submission')
  // Deliberately restricted mailbox syntax: one mailbox, no display name/header delimiters.
  if(s.email.length>254 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(s.email))throw Error('invalid_submission')
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.submissionId)||!s.turnstileToken||s.turnstileToken.length>2048||!/^urn:coela:legal:[A-Za-z0-9:.\-]+@[0-9a-f]{40}$/.test(s.policyVersion)||s.policyVersion.length>160)throw Error('invalid_submission')
  return s
}
