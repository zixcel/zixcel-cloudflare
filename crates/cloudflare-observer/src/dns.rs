//! DNS-only observation. No account, Workers, Pages, storage or application-policy probes.
use crate::{Report, Scope, State, Transport, paging};
use serde_json::json;
use std::collections::BTreeMap;
pub fn observe_dns(
    http: &mut impl Transport,
    scope: Scope,
    now: u64,
) -> Result<Report, &'static str> {
    scope.validate()?;
    if !scope.workers.is_empty() {
        return Err("dns_scope_workers_not_supported");
    }
    let zone = scope.zone.as_ref().ok_or("dns_zone_required")?;
    let mut observations = BTreeMap::new();
    let details = paging::object(
        http,
        &format!("/zones/{}", zone.id),
        &["id", "name", "status", "account_id", "name_servers"],
    );
    if let Some(data) = details.supported()
        && (data["id"] != zone.id
            || data["name"] != zone.domain
            || data["account_id"] != scope.account)
    {
        return Err("zone_scope_mismatch");
    }
    let verified = details.state == State::Supported;
    observations.insert("zone".into(), details);
    if verified {
        observations.insert(
            "dns_records".into(),
            paging::list(
                http,
                &format!("/zones/{}/dns_records?order=name", zone.id),
                "id",
                &[
                    "id",
                    "name",
                    "type",
                    "content",
                    "ttl",
                    "proxied",
                    "modified_on",
                ],
                false,
            ),
        );
    }
    let configuration_sha256 = crate::digest(&json!([scope, observations]));
    Ok(Report {
        schema: "zix-cloudflare-observation/v1".into(),
        scope,
        observed_at: now,
        observations,
        configuration_sha256,
        writes_performed: false,
    })
}
