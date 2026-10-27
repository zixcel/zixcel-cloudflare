mod support;
use serde_json::json;
use support::*;
use zixcel_cloudflare_observer::{ReadError, State, observe_dns};
#[test]
fn dns_audit_performs_only_zone_identity_and_dns_record_reads() {
    let mut http = Fake::new(|path| {
        if path.contains("dns_records") {
            return Ok(list(json!([])));
        }
        Ok(
            json!({"success":true,"result":{"id":"b".repeat(32),"name":"example.org","account":{"id":"a".repeat(32)},"status":"active","name_servers":[]}}),
        )
    });
    let r = observe_dns(&mut http, zone_scope(), NOW).unwrap();
    assert_eq!(http.calls.len(), 2);
    assert!(http.calls.iter().all(|p| p.starts_with("/zones/")));
    assert_eq!(r.observations.len(), 2);
    assert_eq!(r.observations["dns_records"].state, State::Supported);
    r.verify(NOW).unwrap();
}
#[test]
fn denied_zone_and_missing_context_stop_without_unrelated_requests_or_retries() {
    for (code, reason) in [(401, "authentication_rejected"), (403, "permission_denied")] {
        let mut http = Fake::new(move |_| Err(ReadError::Http(code)));
        let r = observe_dns(&mut http, zone_scope(), NOW).unwrap();
        assert_eq!(http.calls.len(), 1);
        assert_eq!(r.observations["zone"].reason, reason);
        assert_eq!(r.observations.len(), 1);
    }
    let mut http = Fake::new(empty);
    assert!(observe_dns(&mut http, scope(), NOW).is_err());
    assert!(http.calls.is_empty());
    let mut scope = zone_scope();
    scope.workers = vec!["unrelated".into()];
    assert!(observe_dns(&mut http, scope, NOW).is_err());
    assert!(http.calls.is_empty());
}
