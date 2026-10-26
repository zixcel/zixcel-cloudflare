export interface NetworkPolicy {
 allowedCountries:string[]; deniedCountries:string[];
 deniedRegions:{country:string;region:string}[]; deniedCidrs:string[];
 deniedAsns:number[]; allowedCidrs:string[];
}
export interface Site {siteKey:string;origin:string;hostname:string;to:string;from:string;policyVersion:string;enabled:boolean;network:NetworkPolicy}
export interface EdgeRequest extends Request {cf?:{country?:string;regionCode?:string;asn?:number}}
export interface Env {
 SITES_JSON?:string;TURNSTILE_SECRET?:string;IP_KEY_SECRET?:string;
 LIMITER?:{limit(v:{key:string}):Promise<{success:boolean}>};
 RECEIPTS?:{reserve(v:{key:string;ttlSeconds:number}):Promise<boolean>};
 EMAIL?:{send(v:{to:string;from:string;subject:string;text:string;replyTo:string}):Promise<{messageId:string}>};
}
export interface Transaction {get(key:string):Promise<unknown>;put(key:string,value:unknown):Promise<void>}
export interface ReceiptState {storage:{transaction<T>(fn:(tx:Transaction)=>Promise<T>):Promise<T>;setAlarm(timestamp:number):Promise<void>;deleteAll():Promise<void>}}
export interface ReceiptNamespace {idFromName(key:string):unknown;get(id:unknown):{fetch(request:Request):Promise<Response>}}
