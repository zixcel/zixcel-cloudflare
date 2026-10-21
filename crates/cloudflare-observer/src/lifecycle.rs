//! Caller-owned intent and creation/end receipts are evidence, never remote cleanup commands.
use crate::{Report, State, utc_seconds};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeSet;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Intent {
    pub component: String,
    pub identity: String,
    pub intended: String,
    pub expires_at: Option<String>,
}
pub fn review(report: &Report, intents: &[Intent], now: u64) -> Result<Value, &'static str> {
    report.verify(now)?;
    if intents.len() > 200 {
        return Err("intent_budget");
    }
    let mut seen = BTreeSet::new();
    let mut findings = Vec::new();
    for intent in intents {
        if !["workers", "custom_domains", "pages", "zones"].contains(&intent.component.as_str())
            || !["production", "preview", "retired"].contains(&intent.intended.as_str())
            || intent.identity.is_empty()
            || intent.identity.len() > 253
            || !seen.insert((&intent.component, &intent.identity))
        {
            return Err("invalid_intent");
        }
        let expired = intent
            .expires_at
            .as_ref()
            .map(|v| utc_seconds(v))
            .transpose()?
            .is_some_and(|time| time < 0 || time as u64 <= now);
        let observed = report.observations.get(&intent.component);
        let complete = observed.is_some_and(|o| o.state == State::Supported);
        let found = observed
            .and_then(|o| o.data.as_ref())
            .and_then(Value::as_array)
            .is_some_and(|rows| rows.iter().any(|r| r["id"] == intent.identity));
        findings.push(json!({"component":intent.component,"identity":intent.identity,
            "intended":intent.intended,"present_in_observed_rows":found,
            "absence_confirmed":complete && !found,"expiry_observed":intent.expires_at.is_some(),
            "expired":expired,"review_required":(found && (expired || intent.intended=="retired")) || !complete,
            "automatic_deletion":false}));
    }
    Ok(
        json!({"schema":"zix-cloudflare-lifecycle-review/v1","source_sha256":report.configuration_sha256,
        "findings":findings,"undeclared_resources":"unknown_intent","writes_performed":false}),
    )
}
pub fn receipt(
    report: &Report,
    component: &str,
    identity: &str,
    event: &str,
    source: &str,
    artifact: &str,
    now: u64,
) -> Result<Value, &'static str> {
    report.verify(now)?;
    if !["workers", "custom_domains", "pages", "zones"].contains(&component)
        || !["created", "ended"].contains(&event)
        || identity.is_empty()
        || identity.len() > 253
        || source.len() != 40
        || artifact.len() != 64
        || !source
            .bytes()
            .chain(artifact.bytes())
            .all(|b| b.is_ascii_hexdigit())
    {
        return Err("invalid_receipt");
    }
    let observed = report
        .observations
        .get(component)
        .ok_or("component_unobserved")?;
    let rows = observed
        .supported()
        .and_then(Value::as_array)
        .ok_or("incomplete_component")?;
    let present = rows.iter().any(|r| r["id"] == identity);
    if present != (event == "created") {
        return Err("postcondition_not_observed");
    }
    Ok(
        json!({"schema":"zix-cloudflare-lifecycle-receipt/v1","scope":report.scope,
        "component":component,"identity":identity,"event":event,"observed_at":report.observed_at,
        "source":source,"artifact_sha256":artifact,"observation_sha256":report.configuration_sha256,
        "authority_granted":false,"writes_performed":false}),
    )
}
