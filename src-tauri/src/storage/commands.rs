use super::{
    create_provider, BookProgress, RemoteFile, StorageConfig, SyncReport, SyncStatus,
    sync_engine::SyncEngine,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

pub struct SyncEngineState(pub Arc<Mutex<SyncEngine>>);

#[tauri::command]
pub async fn user_storage_test_connection(config: StorageConfig) -> Result<bool, String> {
    let provider = create_provider(&config)?;
    provider.test_connection().await
}

#[tauri::command]
pub async fn user_storage_configure(
    config: StorageConfig,
    library_path: String,
    state: State<'_, SyncEngineState>,
) -> Result<(), String> {
    let engine = state.0.lock().await;
    engine.configure(config, library_path).await;
    Ok(())
}

#[tauri::command]
pub async fn user_storage_sync_now(
    state: State<'_, SyncEngineState>,
    app_handle: tauri::AppHandle,
) -> Result<SyncReport, String> {
    let engine = state.0.lock().await;
    engine.sync_now(Some(&app_handle)).await
}

#[tauri::command]
pub async fn user_storage_start_auto_sync(
    state: State<'_, SyncEngineState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let engine = state.0.lock().await;
    engine.start_auto_sync(app_handle).await;
    Ok(())
}

#[tauri::command]
pub async fn user_storage_stop_auto_sync(
    state: State<'_, SyncEngineState>,
) -> Result<(), String> {
    let engine = state.0.lock().await;
    engine.stop_auto_sync().await;
    Ok(())
}

#[tauri::command]
pub async fn user_storage_set_auto_sync_interval(
    secs: u64,
    state: State<'_, SyncEngineState>,
) -> Result<(), String> {
    let engine = state.0.lock().await;
    engine.set_auto_sync_interval(secs).await;
    Ok(())
}

#[tauri::command]
pub async fn user_storage_get_status(
    state: State<'_, SyncEngineState>,
) -> Result<SyncStatus, String> {
    let engine = state.0.lock().await;
    Ok(engine.get_status().await)
}

#[tauri::command]
pub async fn user_storage_list_remote(
    state: State<'_, SyncEngineState>,
) -> Result<Vec<RemoteFile>, String> {
    let engine = state.0.lock().await;
    engine.list_remote().await
}

#[tauri::command]
pub async fn user_storage_update_progress(
    filename: String,
    chapter: usize,
    page: usize,
    percent: f64,
    state: State<'_, SyncEngineState>,
) -> Result<(), String> {
    let engine = state.0.lock().await;
    engine
        .update_book_progress(&filename, BookProgress { chapter, page, percent })
        .await
}

#[tauri::command]
pub async fn user_storage_get_progress(
    filename: String,
    state: State<'_, SyncEngineState>,
) -> Result<Option<BookProgress>, String> {
    let engine = state.0.lock().await;
    engine.get_book_progress(&filename).await
}

// ── Google Drive OAuth ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GDriveAuthResult {
    pub access_token: String,
    pub refresh_token: Option<String>,
}

#[tauri::command]
pub async fn gdrive_start_auth(
    client_id: String,
    client_secret: String,
) -> Result<GDriveAuthResult, String> {
    use super::gdrive::GDriveProvider;
    use tiny_http::{Server, Response};

    // Find a free port
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Bind port: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);

    let provider = GDriveProvider::new(
        client_id.clone(),
        client_secret.clone(),
        None,
        None,
        None,
    );

    let auth_url = provider.get_auth_url(port);

    // Open browser
    let _ = open::that(&auth_url);

    // Start local HTTP server to capture redirect
    let server = Server::http(format!("127.0.0.1:{}", port))
        .map_err(|e| format!("Start auth server: {}", e))?;

    // Wait for the callback (with timeout)
    let request = server
        .recv_timeout(std::time::Duration::from_secs(120))
        .map_err(|e| format!("Auth timeout: {}", e))?
        .ok_or("Auth timeout: no request received")?;

    let url = request.url().to_string();

    // Extract code from query params
    let code = url
        .split('?')
        .nth(1)
        .and_then(|qs| {
            qs.split('&').find_map(|param| {
                let mut parts = param.splitn(2, '=');
                if parts.next() == Some("code") {
                    parts.next().map(|s| s.to_string())
                } else {
                    None
                }
            })
        })
        .ok_or("No auth code in redirect")?;

    // Send success response to browser
    let response_html = "<html><body><h2>Autenticación exitosa</h2><p>Puedes cerrar esta ventana.</p><script>window.close()</script></body></html>";
    let _ = request.respond(Response::from_string(response_html).with_header(
        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap(),
    ));

    // Exchange code for tokens
    let token_resp = provider.exchange_code(&code, port).await?;

    Ok(GDriveAuthResult {
        access_token: token_resp.access_token,
        refresh_token: token_resp.refresh_token,
    })
}
