mod support;
use serde_json::json;
use support::*;
use zixcel_cloudflare_observer::{State, observe};
#[test]
fn changing_totals_missing_pages_and_duplicate_ids_remain_partial() {
    for case in 0..3 {
        let mut http = Fake::new(move |path| {
            if !path.contains("pages/projects") {
                return empty(path);
            }
            let page = if path.contains("page=2") { 2 } else { 1 };
            let mut rows: Vec<_> = (0..100)
                .map(|n| json!({"id":format!("{page}-{n}")}))
                .collect();
            if case == 1 && page == 2 {
                return Err(zixcel_cloudflare_observer::ReadError::Timeout);
            }
            if case == 2 && page == 2 {
                rows[0] = json!({"id":"1-0"});
            }
            Ok(json!({"success":true,"result":rows,"result_info":{
                "page":page,"per_page":100,"total_count":if case==0 && page==2 {201}else{200}}}))
        });
        let report = observe(&mut http, scope(), NOW).unwrap();
        assert_eq!(report.observations["pages"].state, State::Partial);
    }
}
#[test]
fn page_budget_and_unexpected_single_page_cursor_refuse_complete_absence() {
    let mut http = Fake::new(|path| {
        if path.ends_with("/scripts") {
            return Ok(
                json!({"success":true,"result":[],"result_info":{"cursors":{"after":"more"}}}),
            );
        }
        if !path.contains("pages/projects") {
            return empty(path);
        }
        let page = if path.contains("page=2") { 2 } else { 1 };
        let rows: Vec<_> = (0..100)
            .map(|n| json!({"id":format!("{page}-{n}")}))
            .collect();
        Ok(json!({"success":true,"result":rows,"result_info":{"page":page,"total_count":300}}))
    });
    let report = observe(&mut http, scope(), NOW).unwrap();
    assert_eq!(report.observations["workers"].state, State::Partial);
    assert_eq!(report.observations["pages"].reason, "page_budget");
    assert_eq!(
        http.calls
            .iter()
            .filter(|p| p.contains("pages/projects"))
            .count(),
        2
    );
}
