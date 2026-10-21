use serde_json::{Map, Value};
pub(crate) fn project(row: &Value, fields: &[&str]) -> Result<Value, &'static str> {
    if !row.is_object() {
        return Err("invalid_object");
    }
    let mut selected = Map::new();
    for &key in fields {
        let value = match key {
            "account_id" => row.pointer("/account/id"),
            "zone_name" => row.pointer("/ruleset/zone_name"),
            "zone_tag" => row.pointer("/ruleset/zone_tag"),
            _ => row.get(key),
        };
        if let Some(value) = value {
            if matches!(
                key,
                "name_servers" | "domains" | "contact" | "canonical" | "policy"
            ) {
                let entries = value.as_array().ok_or("invalid_names")?;
                if entries.len() > 100
                    || entries
                        .iter()
                        .any(|v| v.as_str().is_none_or(|s| s.len() > 253))
                {
                    return Err("invalid_names");
                }
                selected.insert(key.into(), value.clone());
                continue;
            }
            if value.is_array()
                || value.is_object()
                || value.as_str().is_some_and(|s| s.len() > 8192)
            {
                return Err("invalid_field");
            }
            if matches!(key, "created_on" | "modified_on" | "created" | "expires") {
                crate::utc_seconds(value.as_str().ok_or("invalid_date")?)?;
            }
            selected.insert(key.into(), value.clone());
        }
    }
    Ok(Value::Object(selected))
}
pub(crate) fn identity(row: &Value, key: &str) -> Result<String, &'static str> {
    let id = row[key].as_str().ok_or("missing_identity")?;
    if id.is_empty() || id.len() > 253 || !id.is_ascii() || id.bytes().any(|b| b.is_ascii_control())
    {
        return Err("invalid_identity");
    }
    Ok(id.into())
}
