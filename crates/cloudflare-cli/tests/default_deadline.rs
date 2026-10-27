use serde_json::{Value, json};
use std::{
    io::Write,
    process::{Command, Stdio},
};
fn invoke(operation: &str, timeout: u64) -> std::process::Output {
    let arguments = if operation == "account.read" {
        json!({"account":"a".repeat(32)})
    } else {
        json!({})
    };
    let request = json!({"schema":"zix-provider/v2","id":"0".repeat(32),"operation":operation,
        "arguments":arguments,"limits":{"timeout_ms":timeout,"maximum_response_bytes":131072}});
    let mut child = Command::new(env!("CARGO_BIN_EXE_zix-cloudflare"))
        .arg("--zix-provider-v2")
        .env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(&serde_json::to_vec(&request).unwrap())
        .unwrap();
    child.wait_with_output().unwrap()
}
#[test]
fn real_host_accepts_the_dispatcher_default_before_requesting_credentials() {
    let manifest = zixcel_cloudflare_cli::manifest().unwrap();
    for operation in ["accounts.list", "account.read"] {
        let output = invoke(operation, manifest.timeout_ms);
        assert!(output.status.success(), "host protocol admission failed");
        let response: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(response["error"], "credential_missing");
        assert!(response.get("http_status").is_none());
    }
}
#[test]
fn a_larger_outer_deadline_is_still_rejected() {
    let output = invoke(
        "accounts.list",
        zixcel_cloudflare_cli::manifest().unwrap().timeout_ms + 1,
    );
    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert!(
        String::from_utf8(output.stderr)
            .unwrap()
            .contains("invalid_provider_request")
    );
}
