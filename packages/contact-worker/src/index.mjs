import {handle} from './worker.mjs'
export {ContactReceipts} from './receipts.mjs'
/** @typedef {import('./types.js').ReceiptNamespace} ReceiptNamespace */
export default {
 /** @param {import('./types.js').EdgeRequest} request @param {Omit<import('./types.js').Env,'RECEIPTS'> & {RECEIPTS_NAMESPACE?:ReceiptNamespace}} env */
 fetch(request,env){
  const namespace=env.RECEIPTS_NAMESPACE
  return handle(request,{...env,RECEIPTS:namespace?{async reserve({key}){
   const response=await namespace.get(namespace.idFromName(key)).fetch(new Request('https://receipt.internal/reserve',{method:'POST'}))
   if(response.status===201)return true
   if(response.status===409)return false
   throw Error('reservation_unavailable')
  }}:undefined})
 }
}
