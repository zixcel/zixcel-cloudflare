use serde_json::{Value, json};
use zix_native_provider::{Error, Manifest};

pub fn manifest() -> zix_native_provider::Result<Manifest> {
    let mut m = crate::provider()?.manifest().clone();
    for (id, words, arguments) in [
        (
            "lifecycle.observe",
            vec!["lifecycle", "observe"],
            vec!["account"],
        ),
        (
            "dns.audit",
            vec!["dns", "audit"],
            vec!["account", "zone", "domain"],
        ),
    ] {
        let mut args: Vec<Value> = arguments
            .into_iter()
            .map(|name| json!({"name":name,"required":true,"maximum":253}))
            .collect();
        if id == "lifecycle.observe" {
            args.push(json!({"name":"workers","required":false,"maximum":810}));
        }
        m.commands.push(
            serde_json::from_value(json!({"id":id,"words":words,"effect":"read",
            "description":"Bounded Cloudflare observations; denied/partial are not safe states.",
            "required_permissions":["Read access to explicitly selected account and optional zone"],
            "arguments":args}))
            .map_err(|_| Error("invalid_observer_manifest"))?,
        );
    }
    m.timeout_ms = 40000;
    m.protocol = "zix-provider/v2".into();
    zix_native_provider::guidance::decorate(&mut m, include_bytes!("../api/guidance.json"))?;
    m.validate()?;
    Ok(m)
}
