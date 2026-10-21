use serde_json::{Value, json};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use zeroize::Zeroizing;
use zix_native_provider::{Error, Failure, Manifest, Request, validate_request};
use zixcel_cloudflare_observer::{LiveRead, Scope, Transport, ZoneScope};

pub fn manifest() -> zix_native_provider::Result<Manifest> {
    let mut m = crate::provider()?.manifest().clone();
    for (id, words, arguments) in [
        (
            "lifecycle.observe",
            vec!["lifecycle", "observe"],
            vec!["account"],
        ),
        (
            "dns.audit",
            vec!["dns", "audit"],
            vec!["account", "zone", "domain"],
        ),
    ] {
        let mut args: Vec<Value> = arguments
            .into_iter()
            .map(|name| json!({"name":name,"required":true,"maximum":253}))
            .collect();
        args.push(json!({"name":"workers","required":false,"maximum":810}));
        m.commands.push(
            serde_json::from_value(json!({"id":id,"words":words,"effect":"read",
            "description":"Bounded Cloudflare observations; denied/partial are not safe states.",
            "required_permissions":["Read access to explicitly selected account and optional zone"],
            "arguments":args}))
            .map_err(|_| Error("invalid_observer_manifest"))?,
        );
    }
    m.timeout_ms = 40000;
    m.validate()?;
    Ok(m)
}
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
    let prepared = if scoped.is_none() {
        Some(provider.prepare(request).map_err(Failure::from)?)
    } else {
        None
    };
    let token = Zeroizing::new(
        std::env::var("ZIX_CLOUDFLARE_ACCESS_TOKEN").map_err(|_| Error("credential_missing"))?,
    );
    let mut http = LiveRead::new(
        &token,
        Duration::from_millis(request.limits.timeout_ms.saturating_sub(20).max(50)),
    )
    .map_err(|_| Error("transport_setup"))?;
    if let Some(scope) = scoped {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| Error("clock_unavailable"))?
            .as_secs();
        let report = zixcel_cloudflare_observer::observe(&mut http, scope, now).map_err(Error)?;
        return serde_json::to_value(report).map_err(|_| Failure::from(Error("response_encoding")));
    }
    let plan = prepared.ok_or(Error("operation_missing"))?;
    let path = plan
        .url
        .strip_prefix("https://api.cloudflare.com/client/v4")
        .ok_or(Error("origin_mismatch"))?;
    let value = http.get(path).map_err(|_| Error("provider_http_failed"))?;
    provider
        .project(
            request,
            &serde_json::to_vec(&value).map_err(|_| Error("response_encoding"))?,
        )
        .map_err(Failure::from)
}
