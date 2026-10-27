use serde_json::Value;
use std::process::Command;
#[test]
fn metadata_is_credential_free_complete_for_manifest_and_source_owned() {
    let manifest = zixcel_cloudflare_cli::manifest().unwrap();
    assert_eq!(manifest.protocol, "zix-provider/v2");
    let catalog = zixcel_cloudflare_cli::guidance().unwrap();
    assert!(catalog.validate());
    for c in &manifest.commands {
        assert!(
            catalog
                .entries
                .iter()
                .any(|g| g.operation == c.id && g.selectors.is_empty())
        );
    }
    let output = Command::new(env!("CARGO_BIN_EXE_zix-cloudflare"))
        .arg("--guidance")
        .env_clear()
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let exported: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(exported, serde_json::to_value(catalog).unwrap());
    assert!(output.stderr.is_empty());
}
#[test]
fn dns_handoff_is_a_domain_plan_and_workers_are_not_dns_arguments() {
    let c = zixcel_cloudflare_cli::guidance().unwrap();
    let g = c.select("dns.audit", &Default::default()).unwrap();
    assert!(
        g.next_actions
            .iter()
            .any(|a| a.namespace == "domain" && a.operation == "dns.records.plan")
    );
    let m = zixcel_cloudflare_cli::manifest().unwrap();
    let c = m.commands.iter().find(|c| c.id == "dns.audit").unwrap();
    assert!(!c.arguments.iter().any(|a| a.name == "workers"));
}
