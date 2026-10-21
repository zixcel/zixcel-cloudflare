use crate::{Observation, State, Transport, project, transport};
use serde_json::{Value, json};
use std::collections::BTreeSet;
pub(crate) fn list(
    http: &mut impl Transport,
    path: &str,
    id: &str,
    fields: &[&str],
    single: bool,
) -> Observation {
    let mut rows = Vec::new();
    let mut seen = BTreeSet::new();
    let mut total = None;
    for page in 1..=2 {
        let sep = if path.contains('?') { '&' } else { '?' };
        let url = if single {
            path.into()
        } else {
            format!("{path}{sep}per_page=100&page={page}")
        };
        let response = match http.get(&url) {
            Ok(value) => value,
            Err(e) if rows.is_empty() => return transport::failed(e),
            Err(_) => {
                return Observation::new(State::Partial, "page_unavailable", Some(json!(rows)));
            }
        };
        if response["success"] != true {
            return Observation::new(State::Partial, "provider_envelope_failed", None);
        }
        let Some(batch) = response["result"].as_array().filter(|b| b.len() <= 100) else {
            return Observation::new(State::Partial, "invalid_list", None);
        };
        for row in batch {
            let value = project::identity(row, id).and_then(|key| {
                if !seen.insert(key) {
                    return Err("duplicate_resource");
                }
                project::project(row, fields)
            });
            match value {
                Ok(value) => rows.push(value),
                Err(reason) => return Observation::new(State::Partial, reason, None),
            }
        }
        if single {
            if response["result_info"]["total_count"]
                .as_u64()
                .is_some_and(|n| n > rows.len() as u64)
                || response["result_info"]["cursors"]["after"]
                    .as_str()
                    .is_some_and(|s| !s.is_empty())
            {
                return Observation::new(
                    State::Partial,
                    "unexpected_pagination",
                    Some(json!(rows)),
                );
            }
            return Observation::new(
                State::Supported,
                "documented_single_page",
                Some(json!(rows)),
            );
        }
        let info = &response["result_info"];
        let Some(count) = info["total_count"].as_u64() else {
            return Observation::new(State::Partial, "pagination_unobserved", Some(json!(rows)));
        };
        if info["page"].as_u64() != Some(page)
            || total.is_some_and(|old| old != count)
            || count < rows.len() as u64
        {
            return Observation::new(State::Partial, "pagination_changed", None);
        }
        total = Some(count);
        if info["per_page"].as_u64().is_some_and(|n| n != 100)
            || batch.len() as u64 != (count - (rows.len() - batch.len()) as u64).min(100)
        {
            return Observation::new(State::Partial, "inconsistent_page_size", Some(json!(rows)));
        }
        if rows.len() as u64 == count {
            return Observation::new(State::Supported, "complete_list", Some(json!(rows)));
        }
        if batch.is_empty() {
            break;
        }
    }
    Observation::new(State::Partial, "page_budget", Some(json!(rows)))
}
pub(crate) fn object(http: &mut impl Transport, path: &str, fields: &[&str]) -> Observation {
    match http.get(path) {
        Err(e) => transport::failed(e),
        Ok(value) if value["success"] == true => match project::project(&value["result"], fields) {
            Ok(data)
                if fields
                    .first()
                    .is_none_or(|key| data.get(*key).is_some_and(|v| !v.is_null())) =>
            {
                Observation::new(State::Supported, "single_response", Some(data))
            }
            Ok(_) => Observation::new(State::Partial, "required_field_missing", None),
            Err(reason) => Observation::new(State::Partial, reason, None),
        },
        _ => Observation::new(State::Partial, "provider_envelope_failed", None),
    }
}
