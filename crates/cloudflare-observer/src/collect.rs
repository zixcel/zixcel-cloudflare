use crate::{Observation, Report, Scope, State, Transport, paging};
use serde_json::json;
use std::collections::BTreeMap;

pub fn observe(http: &mut impl Transport, scope: Scope, now: u64) -> Result<Report, &'static str> {
    scope.validate()?;
    let mut observations = BTreeMap::new();
    if let Some(zone) = &scope.zone {
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
        let authorized = details.state == State::Supported;
        observations.insert("zone".into(), details);
        if authorized {
            crate::zone::read(http, &zone.id, &mut observations);
        }
    }
    let base = format!("/accounts/{}", scope.account);
    crate::account::read(http, &base, &mut observations);
    let mut zones = paging::list(
        http,
        &format!("/zones?account.id={}", scope.account),
        "id",
        &["id", "name", "status", "account_id", "name_servers"],
        false,
    );
    if zones
        .supported()
        .and_then(|v| v.as_array())
        .is_some_and(|rows| rows.iter().any(|r| r["account_id"] != scope.account))
    {
        zones = Observation::new(State::Partial, "account_scope_mismatch", None);
    }
    observations.insert("zones".into(), zones);
    for name in &scope.workers {
        observations.insert(
            format!("worker_subdomain:{name}"),
            paging::object(
                http,
                &format!("{base}/workers/scripts/{name}/subdomain"),
                &["enabled", "previews_enabled"],
            ),
        );
    }
    for (key, reason) in [
        (
            "unselected_worker_subdomains",
            "only_explicit_worker_names_are_queried",
        ),
        (
            "pages_deployment_previews",
            "deployment_details_not_requested",
        ),
        (
            "served_html_transformations",
            "requires_caller_owned_artifact_and_delivery_evidence",
        ),
        (
            "custom_protection_and_effective_privacy",
            "settings_do_not_prove_runtime_or_legal_effect",
        ),
    ] {
        observations.insert(
            key.into(),
            Observation::new(State::Unobserved, reason, None),
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
