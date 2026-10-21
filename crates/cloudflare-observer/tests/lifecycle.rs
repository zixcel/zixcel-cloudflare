mod support;
use serde_json::json;
use support::*;
use zixcel_cloudflare_observer::{
    ReadError,
    lifecycle::{Intent, receipt, review},
    observe,
};
#[test]
fn expired_retired_resources_require_review_but_never_delete() {
    let report = observe(
        &mut Fake::new(|p| {
            Ok(if p.ends_with("/scripts") {
                list(json!([{"id":"retired"}]))
            } else {
                list(json!([]))
            })
        }),
        scope(),
        NOW,
    )
    .unwrap();
    let intents = [Intent {
        component: "workers".into(),
        identity: "retired".into(),
        intended: "retired".into(),
        expires_at: Some("2020-01-01T00:00:00Z".into()),
    }];
    let reviewed = review(&report, &intents, NOW).unwrap();
    assert_eq!(reviewed["findings"][0]["review_required"], true);
    assert_eq!(reviewed["findings"][0]["automatic_deletion"], false);
}
#[test]
fn unknown_expiry_and_incomplete_absence_are_not_guessed() {
    let report = observe(&mut Fake::new(|_| Err(ReadError::Http(403))), scope(), NOW).unwrap();
    let intent = Intent {
        component: "workers".into(),
        identity: "absent".into(),
        intended: "preview".into(),
        expires_at: None,
    };
    let reviewed = review(&report, &[intent], NOW).unwrap();
    assert_eq!(reviewed["findings"][0]["absence_confirmed"], false);
    assert_eq!(reviewed["findings"][0]["expiry_observed"], false);
    assert!(
        receipt(
            &report,
            "workers",
            "absent",
            "ended",
            &"a".repeat(40),
            &"b".repeat(64),
            NOW
        )
        .is_err()
    );
}
#[test]
fn tampered_stale_and_future_reports_are_refused() {
    let mut report = observe(&mut Fake::new(empty), scope(), NOW).unwrap();
    assert!(report.verify(NOW + 86401).is_err());
    assert!(report.verify(NOW - 61).is_err());
    report.observations.remove("workers");
    assert!(report.verify(NOW).is_err());
}
#[test]
fn postcondition_receipts_are_scoped_read_evidence_not_authority() {
    let report = observe(&mut Fake::new(empty), scope(), NOW).unwrap();
    let value = receipt(
        &report,
        "workers",
        "absent",
        "ended",
        &"a".repeat(40),
        &"b".repeat(64),
        NOW,
    )
    .unwrap();
    assert_eq!(value["authority_granted"], false);
    assert!(
        receipt(
            &report,
            "web_analytics",
            "absent",
            "ended",
            &"a".repeat(40),
            &"b".repeat(64),
            NOW
        )
        .is_err()
    );
    assert!(
        receipt(
            &report,
            "workers",
            "absent",
            "created",
            &"a".repeat(40),
            &"b".repeat(64),
            NOW
        )
        .is_err()
    );
}
