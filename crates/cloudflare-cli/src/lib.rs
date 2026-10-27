mod catalog;
mod legacy;
mod observer;
pub use catalog::manifest;
pub use observer::execute;
pub fn provider() -> zix_native_provider::Result<zix_native_provider::Provider> {
    zix_native_provider::Provider::load(
        include_bytes!("../api/routes.json"),
        include_bytes!("../api/policy.json"),
        env!("CARGO_PKG_VERSION"),
    )
}

pub fn guidance() -> zix_native_provider::Result<zix_native_provider::GuidanceCatalog> {
    let manifest = manifest()?;
    zix_native_provider::guidance::catalog(&manifest, include_bytes!("../api/guidance.json"))
}
