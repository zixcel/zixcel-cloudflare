use serde_json::json;
use zix_native_provider::{Request, validate_request};
#[test]
fn combined_manifest_preserves_old_reads_and_scopes_new_audits() {
    let manifest = zixcel_cloudflare_cli::manifest().unwrap();
    assert_eq!(manifest.commands.len(), 6);
    assert!(manifest.commands.iter().all(|c| c.effect == "read"));
    let mut request:Request=serde_json::from_value(json!({"schema":"zix-provider/v2","id":"0".repeat(32),
        "operation":"dns.audit","arguments":{"account":"a".repeat(32),"zone":"b".repeat(32),"domain":"example.org"},
        "limits":{"timeout_ms":5000,"maximum_response_bytes":65536}})).unwrap();
    assert!(validate_request(&manifest, &request).is_ok());
    request
        .arguments
        .insert("url".into(), "https://other.invalid".into());
    assert!(zixcel_cloudflare_cli::execute(&request).is_err());
}
