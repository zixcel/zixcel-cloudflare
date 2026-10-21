fn main() -> std::process::ExitCode {
    match zixcel_cloudflare_cli::manifest() {
        Ok(manifest) => zix_native_provider::serve(manifest, zixcel_cloudflare_cli::execute),
        Err(_) => std::process::ExitCode::from(2),
    }
}
