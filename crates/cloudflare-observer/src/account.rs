use crate::{Observation, Transport, paging};
use std::collections::BTreeMap;
pub(crate) fn read(http: &mut impl Transport, base: &str, out: &mut BTreeMap<String, Observation>) {
    out.insert(
        "workers".into(),
        paging::list(
            http,
            &format!("{base}/workers/scripts"),
            "id",
            &["id", "created_on", "modified_on"],
            true,
        ),
    );
    out.insert(
        "custom_domains".into(),
        paging::list(
            http,
            &format!("{base}/workers/domains"),
            "id",
            &["id", "hostname", "zone_id", "service", "environment"],
            true,
        ),
    );
    out.insert(
        "pages".into(),
        paging::list(
            http,
            &format!("{base}/pages/projects"),
            "id",
            &["id", "name", "subdomain", "domains", "created_on"],
            false,
        ),
    );
    out.insert(
        "web_analytics".into(),
        paging::list(
            http,
            &format!("{base}/rum/site_info/list"),
            "site_tag",
            &[
                "site_tag",
                "auto_install",
                "created",
                "zone_name",
                "zone_tag",
            ],
            false,
        ),
    );
    out.insert(
        "turnstile_widgets".into(),
        paging::list(
            http,
            &format!("{base}/challenges/widgets"),
            "sitekey",
            &["sitekey", "name", "domains", "mode", "clearance_level"],
            false,
        ),
    );
}
