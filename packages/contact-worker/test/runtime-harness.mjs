// Local workerd acceptance only. Never use this entry point for deployment.
export {ContactReceipts} from '../src/receipts.mjs'
export default {
 async fetch(request,env){
  if(new URL(request.url).pathname!=='/test-reservation'||request.method!=='POST')return new Response(null,{status:404})
  const stub=env.RECEIPTS_NAMESPACE.get(env.RECEIPTS_NAMESPACE.idFromName('synthetic-acceptance'))
  return stub.fetch(new Request('https://receipt.internal/reserve',{method:'POST'}))
 }
}
