use serde_json::{Value, json};
use zixcel_cloudflare_observer::{ReadError, Scope, Transport, ZoneScope};
pub const NOW: u64 = 1_700_000_000;
pub fn scope() -> Scope {
    Scope {
        account: "a".repeat(32),
        zone: None,
        workers: vec![],
    }
}
#[allow(dead_code)]
pub fn zone_scope() -> Scope {
    Scope {
        zone: Some(ZoneScope {
            id: "b".repeat(32),
            domain: "example.org".into(),
        }),
        ..scope()
    }
}
type Responder = dyn Fn(&str) -> Result<Value, ReadError>;
pub struct Fake {
    pub calls: Vec<String>,
    pub respond: Box<Responder>,
}
impl Fake {
    pub fn new(f: impl Fn(&str) -> Result<Value, ReadError> + 'static) -> Self {
        Self {
            calls: vec![],
            respond: Box::new(f),
        }
    }
}
impl Transport for Fake {
    fn get(&mut self, path: &str) -> Result<Value, ReadError> {
        self.calls.push(path.into());
        (self.respond)(path)
    }
}
pub fn list(rows: Value) -> Value {
    json!({"success":true,"result":rows,"result_info":{"page":1,"per_page":100,"total_count":rows.as_array().unwrap().len()}})
}
pub fn empty(_: &str) -> Result<Value, ReadError> {
    Ok(list(json!([])))
}
