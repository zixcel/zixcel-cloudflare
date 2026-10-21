use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum State {
    Supported,
    Denied,
    Unobserved,
    Partial,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Observation {
    pub state: State,
    pub reason: String,
    pub data: Option<Value>,
}
impl Observation {
    pub(crate) fn new(state: State, reason: &str, data: Option<Value>) -> Self {
        Self {
            state,
            reason: reason.into(),
            data,
        }
    }
    pub fn supported(&self) -> Option<&Value> {
        (self.state == State::Supported)
            .then_some(self.data.as_ref())
            .flatten()
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ZoneScope {
    pub id: String,
    pub domain: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Scope {
    pub account: String,
    pub zone: Option<ZoneScope>,
    #[serde(default)]
    pub workers: Vec<String>,
}
impl Scope {
    pub fn validate(&self) -> Result<(), &'static str> {
        let unique: std::collections::BTreeSet<_> = self.workers.iter().collect();
        if !crate::valid_id(&self.account)
            || self.workers.len() > 8
            || unique.len() != self.workers.len()
            || self.workers.iter().any(|name| !crate::valid_name(name))
        {
            return Err("invalid_scope");
        }
        if let Some(zone) = &self.zone
            && (!crate::valid_id(&zone.id)
                || zone.domain.len() > 253
                || !zone.domain.contains('.')
                || zone.domain.split('.').any(|label| {
                    label.is_empty()
                        || label.len() > 63
                        || label.starts_with('-')
                        || label.ends_with('-')
                        || !label
                            .bytes()
                            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
                }))
        {
            return Err("invalid_zone_scope");
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Report {
    pub schema: String,
    pub scope: Scope,
    pub observed_at: u64,
    pub observations: BTreeMap<String, Observation>,
    pub configuration_sha256: String,
    pub writes_performed: bool,
}
impl Report {
    pub fn verify(&self, now: u64) -> Result<(), &'static str> {
        self.scope.validate()?;
        if self.schema != "zix-cloudflare-observation/v1"
            || self.writes_performed
            || self.observed_at > now.saturating_add(60)
            || now.saturating_sub(self.observed_at) > 86400
        {
            return Err("invalid_or_stale_report");
        }
        let value = serde_json::json!([self.scope, self.observations]);
        if crate::digest(&value) != self.configuration_sha256 {
            return Err("report_tampered");
        }
        Ok(())
    }
}
