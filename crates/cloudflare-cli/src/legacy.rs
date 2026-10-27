use zix_native_provider::{Provider, Request};

// The combined host admits longer audits, while legacy routes retain their own ceiling.
pub(crate) fn request(provider: &Provider, original: &Request) -> Request {
    let mut request = original.clone();
    request.schema = provider.manifest().protocol.clone();
    request.binding = None;
    request.limits.timeout_ms = request
        .limits
        .timeout_ms
        .min(provider.manifest().timeout_ms);
    request
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn dispatcher_default_is_bounded_for_both_preparation_and_projection() {
        let provider = crate::provider().unwrap();
        let manifest = crate::manifest().unwrap();
        for operation in ["accounts.list", "account.read"] {
            let arguments = if operation == "account.read" {
                json!({"account":"a".repeat(32)})
            } else {
                json!({})
            };
            let original: Request = serde_json::from_value(json!({"schema":"zix-provider/v2", "id":"0".repeat(32),
                "operation":operation,"arguments":arguments,"limits":{"timeout_ms":manifest.timeout_ms,"maximum_response_bytes":131072}})).unwrap();
            zix_native_provider::validate_request(&manifest, &original).unwrap();
            let bounded = request(&provider, &original);
            assert_eq!(original.limits.timeout_ms, 40000);
            assert_eq!(bounded.limits.timeout_ms, 20000);
            provider.prepare(&bounded).unwrap();
            let result = if operation == "accounts.list" {
                json!([{ "id":"a".repeat(32),"name":"Example"}])
            } else {
                json!({"id":"a".repeat(32),"name":"Example"})
            };
            provider
                .project(
                    &bounded,
                    &serde_json::to_vec(&json!({"success":true,"result":result})).unwrap(),
                )
                .unwrap();
            let mut shorter = original.clone();
            shorter.limits.timeout_ms = 5000;
            assert_eq!(request(&provider, &shorter).limits.timeout_ms, 5000);
        }
    }
}
