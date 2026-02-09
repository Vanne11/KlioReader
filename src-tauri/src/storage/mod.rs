pub mod s3;
pub mod webdav;
pub mod gdrive;
pub mod sync_engine;
pub mod commands;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Tipos compartidos ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFile {
    pub key: String,
    pub size: u64,
    pub last_modified: String,
    pub etag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    pub provider: String, // "s3" | "webdav" | "gdrive"
    #[serde(flatten)]
    pub params: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub syncing: bool,
    pub last_sync: Option<String>,
    pub pending_up: usize,
    pub pending_down: usize,
    pub error: Option<String>,
    pub auto_sync_enabled: bool,
    pub auto_sync_interval_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncReport {
    pub uploaded: Vec<String>,
    pub downloaded: Vec<String>,
    pub deleted_remote: Vec<String>,
    pub deleted_local: Vec<String>,
    pub conflicts: Vec<String>,
    pub errors: Vec<String>,
    pub metadata_synced: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookProgress {
    pub chapter: usize,
    pub page: usize,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookSyncMeta {
    pub filename: String,
    pub size: u64,
    pub last_modified: String,
    #[serde(default)]
    pub progress: Option<BookProgress>,
    #[serde(default)]
    pub notes: Vec<serde_json::Value>,
    #[serde(default)]
    pub bookmarks: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KlioSyncData {
    pub books: HashMap<String, BookSyncMeta>,
    pub last_sync: String,
}

impl Default for KlioSyncData {
    fn default() -> Self {
        Self {
            books: HashMap::new(),
            last_sync: chrono::Utc::now().to_rfc3339(),
        }
    }
}

// ── Trait del proveedor ──

#[allow(dead_code)]
#[async_trait::async_trait]
pub trait UserStorageProvider: Send + Sync {
    async fn list_files(&self, prefix: &str) -> Result<Vec<RemoteFile>, String>;
    async fn upload(&self, local_path: &str, remote_key: &str) -> Result<(), String>;
    async fn download(&self, remote_key: &str, local_path: &str) -> Result<(), String>;
    async fn delete(&self, remote_key: &str) -> Result<(), String>;
    async fn read_bytes(&self, remote_key: &str) -> Result<Vec<u8>, String>;
    async fn write_bytes(&self, remote_key: &str, data: &[u8]) -> Result<(), String>;
    async fn test_connection(&self) -> Result<bool, String>;
}

// Convenience methods for JSON
pub async fn read_json(provider: &dyn UserStorageProvider, key: &str) -> Result<String, String> {
    let bytes = provider.read_bytes(key).await?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

pub async fn write_json(provider: &dyn UserStorageProvider, key: &str, data: &str) -> Result<(), String> {
    provider.write_bytes(key, data.as_bytes()).await
}

// ── Factory ──

pub fn create_provider(config: &StorageConfig) -> Result<Box<dyn UserStorageProvider>, String> {
    match config.provider.as_str() {
        "s3" => {
            let p = s3::S3Provider::new(
                config.params.get("endpoint").cloned().unwrap_or_default(),
                config.params.get("region").cloned().unwrap_or_else(|| "us-east-1".to_string()),
                config.params.get("bucket").cloned().unwrap_or_default(),
                config.params.get("access_key").cloned().unwrap_or_default(),
                config.params.get("secret_key").cloned().unwrap_or_default(),
                config.params.get("path_prefix").cloned().unwrap_or_else(|| "klioreader/".to_string()),
            );
            Ok(Box::new(p))
        }
        "webdav" => {
            let p = webdav::WebDavProvider::new(
                config.params.get("url").cloned().unwrap_or_default(),
                config.params.get("username").cloned().unwrap_or_default(),
                config.params.get("password").cloned().unwrap_or_default(),
                config.params.get("path_prefix").cloned().unwrap_or_else(|| "/klioreader/".to_string()),
            );
            Ok(Box::new(p))
        }
        "gdrive" => {
            let p = gdrive::GDriveProvider::new(
                config.params.get("client_id").cloned().unwrap_or_default(),
                config.params.get("client_secret").cloned().unwrap_or_default(),
                config.params.get("access_token").cloned(),
                config.params.get("refresh_token").cloned(),
                config.params.get("folder_id").cloned(),
            );
            Ok(Box::new(p))
        }
        _ => Err(format!("Unknown provider: {}", config.provider)),
    }
}
