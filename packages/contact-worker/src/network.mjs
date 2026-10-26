import ipaddr from 'ipaddr.js'

/** @typedef {{allowedCountries: string[], deniedCountries: string[], deniedRegions: {country: string, region: string}[], deniedCidrs: string[], deniedAsns: number[], allowedCidrs:string[]}} NetworkPolicy */
/** @param {NetworkPolicy} p */
export function validateNetwork(p) {
  if(!p || Object.keys(p).sort().join(',')!=='allowedCidrs,allowedCountries,deniedAsns,deniedCidrs,deniedCountries,deniedRegions')throw Error('invalid_network_policy')
  if (!p || !Array.isArray(p.allowedCountries) || !Array.isArray(p.deniedCountries) || !Array.isArray(p.deniedRegions) || !Array.isArray(p.deniedCidrs) || !Array.isArray(p.deniedAsns) || !Array.isArray(p.allowedCidrs)) throw Error('invalid_network_policy')
  if ([...p.allowedCountries,...p.deniedCountries].some(x=>!/^[A-Z]{2}$/.test(x)) || p.deniedRegions.some(x=>!x || !/^[A-Z]{2}$/.test(x.country) || !/^[A-Za-z0-9-]{1,8}$/.test(x.region)) || p.deniedAsns.some(x=>!Number.isSafeInteger(x)||x<=0)) throw Error('invalid_network_policy')
  for(const cidr of [...p.allowedCidrs,...p.deniedCidrs]) {
    const [network]=ipaddr.parseCIDR(cidr)
    if(network.kind()==='ipv6' && /** @type {import('ipaddr.js').IPv6} */(network).isIPv4MappedAddress())throw Error('Use canonical IPv4 CIDR for mapped addresses')
  }
}
/** Cloudflare-populated metadata only; forwarded/browser country/VPN headers are ignored.
 * @param {{country?: string, regionCode?: string, asn?: number}} cf
 * @param {string|null} ip
 * @param {NetworkPolicy} policy
 */
export function networkAllowed(cf, ip, policy) {
  if (!ip || !ipaddr.isValid(ip)) return false
  let address=ipaddr.parse(ip)
  if(address.kind()==='ipv6' && /** @type {import('ipaddr.js').IPv6} */(address).isIPv4MappedAddress()) address=/** @type {import('ipaddr.js').IPv6} */(address).toIPv4Address()
  const geographic=policy.allowedCountries.length||policy.deniedCountries.length||policy.deniedRegions.length
  if (geographic && (!cf.country || !/^[A-Z]{2}$/.test(cf.country))) return false
  if(policy.allowedCountries.length && !policy.allowedCountries.includes(cf.country||''))return false
  if(policy.deniedCountries.includes(cf.country||''))return false
  if(policy.deniedRegions.some(x=>x.country===cf.country && (!cf.regionCode || x.region===cf.regionCode)))return false
  if(policy.deniedAsns.length && (!cf.asn || policy.deniedAsns.includes(cf.asn)))return false
  if(policy.deniedCidrs.some(cidr=>{const [net,bits]=ipaddr.parseCIDR(cidr);return net.kind()===address.kind() && address.match(net,bits)}))return false
  if(policy.allowedCidrs.length && !policy.allowedCidrs.some(cidr=>{const [net,bits]=ipaddr.parseCIDR(cidr);return net.kind()===address.kind() && address.match(net,bits)}))return false
  return true
}
