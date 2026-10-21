#![forbid(unsafe_code)]
//! Vendor read projections only. No mutation, scheduler, script download or secret lookup.
mod account;
mod collect;
pub mod lifecycle;
mod model;
mod paging;
mod project;
mod transport;
mod zone;
pub use collect::observe;
pub use model::{Observation, Report, Scope, State, ZoneScope};
pub use transport::{LiveRead, ReadError, Transport};

pub fn valid_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
pub fn valid_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
}
pub fn utc_seconds(value: &str) -> Result<i64, &'static str> {
    let date = chrono::DateTime::parse_from_rfc3339(value).map_err(|_| "invalid_utc_date")?;
    if date.offset().local_minus_utc() != 0 {
        return Err("non_utc_date");
    }
    Ok(date.timestamp())
}
pub fn digest(value: &serde_json::Value) -> String {
    use sha2::{Digest, Sha256};
    fn canonical(value: &serde_json::Value) -> serde_json::Value {
        match value {
            serde_json::Value::Object(map) => {
                let sorted: std::collections::BTreeMap<_, _> =
                    map.iter().map(|(k, v)| (k.clone(), canonical(v))).collect();
                serde_json::to_value(sorted).expect("JSON map serialization")
            }
            serde_json::Value::Array(rows) => rows.iter().map(canonical).collect(),
            other => other.clone(),
        }
    }
    format!(
        "{:x}",
        Sha256::digest(canonical(value).to_string().as_bytes())
    )
}
