import {readFileSync} from 'node:fs'
import {validateSites} from '../src/worker.mjs'
const path=process.argv[2]
if(!path)throw Error('Provide a sites JSON file; no network or writes are performed')
const sites=validateSites({SITES_JSON:readFileSync(path,'utf8')})
console.log(JSON.stringify({state:'configuration_valid',remoteWrites:false,sites:sites.map(s=>({siteKey:s.siteKey,enabled:s.enabled,allowedCidrs:s.network.allowedCidrs.length,deniedCidrs:s.network.deniedCidrs.length}))}))
