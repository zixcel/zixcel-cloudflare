use crate::manifest;
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use zeroize::Zeroizing;
use zix_native_provider::{Error, Failure, Request, validate_request};
use zixcel_cloudflare_observer::{LiveRead, ReadError, Scope, Transport, ZoneScope};

fn scope(request: &Request) -> Result<Scope, Failure> {
    let arg = |name: &str| {
        request
            .arguments
            .get(name)
            .cloned()
            .ok_or(Error("argument_missing"))
    };
    let workers = request
        .arguments
        .get("workers")
        .map(|s| s.split(',').map(str::to_owned).collect())
        .unwrap_or_default();
    let zone = if request.operation == "dns.audit" {
        Some(ZoneScope {
            id: arg("zone")?,
            domain: arg("domain")?,
        })
    } else {
        None
    };
    let s = Scope {
        account: arg("account")?,
        zone,
        workers,
    };
    s.validate().map_err(|code| Failure::from(Error(code)))?;
    Ok(s)
}
pub fn execute(request: &Request) -> Result<Value, Failure> {
    validate_request(&manifest().map_err(Failure::from)?, request)?;
    let scoped = if matches!(
        request.operation.as_str(),
        "lifecycle.observe" | "dns.audit"
    ) {
        Some(scope(request)?)
    } else {
        None
    };
    let provider = crate::provider().map_err(Failure::from)?;
    let legacy = crate::legacy::request(&provider, request);
    let prepared = if scoped.is_none() {
        Some(provider.prepare(&legacy).map_err(Failure::from)?)
    } else {
        None
    };
    let token = Zeroizing::new(
        std::env::var("ZIX_CLOUDFLARE_ACCESS_TOKEN").map_err(|_| Error("credential_missing"))?,
    );
    let timeout = if scoped.is_some() {
        request.limits.timeout_ms
    } else {
        legacy.limits.timeout_ms
    };
    let mut http = LiveRead::new(
        &token,
        Duration::from_millis(timeout.saturating_sub(20).max(50)),
    )
    .map_err(|_| Error("transport_setup"))?;
    if let Some(scope) = scoped {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| Error("clock_unavailable"))?
            .as_secs();
        let report = if request.operation == "dns.audit" {
            zixcel_cloudflare_observer::observe_dns(&mut http, scope, now)
        } else {
            zixcel_cloudflare_observer::observe(&mut http, scope, now)
        }
        .map_err(Error)?;
        return serde_json::to_value(report).map_err(|_| Failure::from(Error("response_encoding")));
    }
    let plan = prepared.ok_or(Error("operation_missing"))?;
    let path = plan
        .url
        .strip_prefix("https://api.cloudflare.com/client/v4")
        .ok_or(Error("origin_mismatch"))?;
    let value = http.get(path).map_err(|e| match e {
        ReadError::Http(status) => Failure {
            code: "provider_http_failed",
            http_status: Some(status),
        },
        ReadError::Budget => Failure::from(Error("provider_response_limit")),
        _ => Failure::from(Error("provider_transport_failed")),
    })?;
    provider
        .project(
            &legacy,
            &serde_json::to_vec(&value).map_err(|_| Error("response_encoding"))?,
        )
        .map_err(Failure::from)
}
