/** Atomic reservation metadata only, no inquiry content. One bounded object per random submission ID. */
export class ContactReceipts {
 /** @param {import('./types.js').ReceiptState} state */
 constructor(state){this.state=state}
 /** @param {Request} request */
 async fetch(request){
  if(request.method!=='POST')return new Response(null,{status:405})
  const reserved=await this.state.storage.transaction(async tx=>{
   if(await tx.get('reserved'))return false
   await tx.put('reserved',true);return true
  })
  if(reserved)await this.state.storage.setAlarm(Date.now()+86400000)
  return new Response(null,{status:reserved?201:409})
 }
 async alarm(){await this.state.storage.deleteAll()}
}
