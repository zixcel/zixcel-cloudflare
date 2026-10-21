use crowsi_provider_read_http::{Error, HttpsRead};
use serde_json::Value;
use std::time::Duration;
#[derive(Clone, Copy, Debug)]
pub enum ReadError {
    Http(u16),
    Timeout,
    Budget,
    Schema,
    Transport,
}
pub trait Transport {
    fn get(&mut self, path: &str) -> Result<Value, ReadError>;
}
pub struct LiveRead {
    http: HttpsRead,
    bytes_left: usize,
}
impl LiveRead {
    pub fn new(token: &str, timeout: Duration) -> Result<Self, ReadError> {
        let http =
            HttpsRead::new("https://api.cloudflare.com", token, timeout, 32).map_err(convert)?;
        Ok(Self {
            http,
            bytes_left: 4 * 1024 * 1024,
        })
    }
}
fn convert(error: Error) -> ReadError {
    match error {
        Error::Status(code) => ReadError::Http(code),
        Error::BodyLimit | Error::Budget => ReadError::Budget,
        _ => ReadError::Transport,
    }
}
impl Transport for LiveRead {
    fn get(&mut self, path: &str) -> Result<Value, ReadError> {
        if !path.starts_with('/')
            || path.starts_with("//")
            || path.contains(['#', '\\', '\r', '\n'])
            || path.contains("..")
            || !path.is_ascii()
        {
            return Err(ReadError::Schema);
        }
        let limit = self.bytes_left.min(1024 * 1024);
        if limit == 0 {
            return Err(ReadError::Budget);
        }
        let bytes = self
            .http
            .get(
                &format!("https://api.cloudflare.com/client/v4{path}"),
                &[],
                limit,
            )
            .map_err(convert)?;
        self.bytes_left -= bytes.len();
        serde_json::from_slice(&bytes).map_err(|_| ReadError::Schema)
    }
}
pub(crate) fn failed(error: ReadError) -> crate::Observation {
    use crate::{Observation, State};
    let (state, reason) = match error {
        ReadError::Http(401 | 403) => (State::Denied, "permission_denied"),
        ReadError::Http(404) => (State::Unobserved, "not_found_or_hidden"),
        ReadError::Timeout => (State::Unobserved, "timeout"),
        ReadError::Budget => (State::Partial, "request_or_body_budget"),
        ReadError::Schema => (State::Partial, "invalid_response"),
        _ => (State::Unobserved, "transport_or_provider_failure"),
    };
    Observation::new(state, reason, None)
}
