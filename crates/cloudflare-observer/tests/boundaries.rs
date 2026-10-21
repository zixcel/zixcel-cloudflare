mod support;
use serde_json::json;
use support::*;
use zixcel_cloudflare_observer::{ReadError, State, observe, utc_seconds};
#[test]
fn invalid_and_duplicate_scope_never_starts_transport() {
    let mut http = Fake::new(empty);
    let mut s = scope();
    s.account = "../wrong".into();
    assert!(observe(&mut http, s, NOW).is_err());
    assert!(http.calls.is_empty());
    let mut s = scope();
    s.workers = vec!["same".into(); 2];
    assert!(observe(&mut http, s, NOW).is_err());
    assert!(http.calls.is_empty());
}
#[test]
fn error_states_never_become_an_empty_successful_inventory() {
    for (error, state) in [
        (ReadError::Http(403), State::Denied),
        (ReadError::Http(404), State::Unobserved),
        (ReadError::Timeout, State::Unobserved),
        (ReadError::Budget, State::Partial),
        (ReadError::Schema, State::Partial),
    ] {
        let report = observe(&mut Fake::new(move |_| Err(error)), scope(), NOW).unwrap();
        assert_eq!(report.observations["workers"].state, state);
        assert!(report.observations["workers"].data.is_none());
    }
}
#[test]
fn zone_identity_prevents_cross_account_and_wrong_domain_reads() {
    for field in ["account", "name", "id"] {
        let mut http = Fake::new(move |_| {
            let mut row =
                json!({"id":"b".repeat(32),"name":"example.org","account":{"id":"a".repeat(32)}});
            row[field] = json!("wrong");
            Ok(json!({"success":true,"result":row}))
        });
        assert!(observe(&mut http, zone_scope(), NOW).is_err());
        assert_eq!(http.calls.len(), 1);
    }
}
#[test]
fn duplicates_and_invalid_calendar_dates_are_partial() {
    for row in [
        json!([{"id":"worker"},{"id":"worker"}]),
        json!([{"id":"worker","created_on":"2026-02-30T00:00:00Z"}]),
    ] {
        let report = observe(
            &mut Fake::new(move |path| {
                Ok(if path.ends_with("/scripts") {
                    list(row.clone())
                } else {
                    list(json!([]))
                })
            }),
            scope(),
            NOW,
        )
        .unwrap();
        assert_eq!(report.observations["workers"].state, State::Partial);
    }
    assert!(utc_seconds("2024-02-29T00:00:00Z").is_ok());
    assert!(utc_seconds("2024-02-29T00:00:00+09:00").is_err());
}
#[test]
fn projection_excludes_secrets_code_and_snippets() {
    let mut http = Fake::new(|path| {
        Ok(if path.contains("challenges/widgets") {
            list(json!([{"sitekey":"public","secret":"do-not-output","domains":["example.org"]}]))
        } else if path.ends_with("/scripts") {
            list(
                json!([{"id":"worker","bindings":[{"secret":"do-not-output"}],"script":"do-not-output"}]),
            )
        } else {
            list(json!([]))
        })
    });
    let report = observe(&mut http, scope(), NOW).unwrap();
    assert!(
        !serde_json::to_string(&report)
            .unwrap()
            .contains("do-not-output")
    );
    assert!(!report.writes_performed);
}
#[test]
fn only_selected_workers_have_preview_settings_requests() {
    let mut s = scope();
    s.workers = vec!["selected".into()];
    let mut http = Fake::new(|path| {
        Ok(if path.ends_with("/subdomain") {
            json!({"success":true,"result":{"enabled":false,"previews_enabled":false}})
        } else {
            list(json!([]))
        })
    });
    let report = observe(&mut http, s, NOW).unwrap();
    assert_eq!(
        http.calls
            .iter()
            .filter(|p| p.ends_with("/subdomain"))
            .count(),
        1
    );
    assert_eq!(
        report.observations["worker_subdomain:selected"]
            .data
            .as_ref()
            .unwrap()["enabled"],
        false
    );
    assert_eq!(
        report.observations["unselected_worker_subdomains"].state,
        State::Unobserved
    );
}
