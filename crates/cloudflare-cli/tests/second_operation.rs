use serde_json::{Value, json};
use zix_native_provider::Request;
#[test]
fn second_reviewed_operation_projects_a_single_response_without_following_links() {
    let sample: Value = serde_json::from_str(include_str!("second-observation.json")).unwrap();
    let request: Request =
        serde_json::from_value(json!({"schema":"zix-provider/v1", "id":"0".repeat(32),
        "operation":sample["operation"],"arguments":sample["arguments"],
        "limits":{"timeout_ms":5000,"maximum_response_bytes":65536}}))
        .unwrap();
    let provider = zixcel_cloudflare_cli::provider().unwrap();
    assert_eq!(
        provider.prepare(&request).unwrap().url,
        sample["url"].as_str().unwrap()
    );
    let result = provider
        .project(&request, &serde_json::to_vec(&sample["raw"]).unwrap())
        .unwrap();
    assert_eq!(result["completeness"], "single_response");
    assert!(!result.to_string().contains("other.example.invalid"));
    assert!(!result.to_string().contains("unselected-private-field"));
    assert!(provider.project(&request, b"{}").is_err());
}
