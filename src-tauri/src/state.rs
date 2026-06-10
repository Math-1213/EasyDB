use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    pub connection_string: Mutex<Option<String>>,
}

pub fn get_tls_connector() -> Result<MakeTlsConnector, String> {
    let na_tls = TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
        .map_err(|e| format!("Falha ao construir TLS: {}", e))?;

    Ok(MakeTlsConnector::new(na_tls))
}
