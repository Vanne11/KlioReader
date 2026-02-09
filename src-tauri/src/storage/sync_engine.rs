use super::{
    create_provider, read_json, write_json,
    BookProgress, BookSyncMeta, KlioSyncData, RemoteFile, StorageConfig, SyncReport, SyncStatus,
};
use chrono::Utc;
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;

const SYNC_META_FILE: &str = ".klio-sync.json";
const SYNC_STATE_FILE: &str = "sync_state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocalSyncState {
    last_sync: String,
    file_hashes: HashMap<String, FileState>,
    config_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FileState {
    md5: String,
    size: u64,
    last_modified: String,
}

impl Default for LocalSyncState {
    fn default() -> Self {
        Self {
            last_sync: String::new(),
            file_hashes: HashMap::new(),
            config_hash: String::new(),
        }
    }
}

pub struct SyncEngine {
    config: Arc<Mutex<Option<StorageConfig>>>,
    library_path: Arc<Mutex<Option<String>>>,
    status: Arc<Mutex<SyncStatus>>,
    auto_sync_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl SyncEngine {
    pub fn new() -> Self {
        Self {
            config: Arc::new(Mutex::new(None)),
            library_path: Arc::new(Mutex::new(None)),
            status: Arc::new(Mutex::new(SyncStatus {
                syncing: false,
                last_sync: None,
                pending_up: 0,
                pending_down: 0,
                error: None,
                auto_sync_enabled: false,
                auto_sync_interval_secs: 300,
            })),
            auto_sync_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn configure(&self, config: StorageConfig, library_path: String) {
        *self.config.lock().await = Some(config);
        *self.library_path.lock().await = Some(library_path);
    }

    pub async fn get_status(&self) -> SyncStatus {
        self.status.lock().await.clone()
    }

    fn state_file_path() -> PathBuf {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("klioreader");
        std::fs::create_dir_all(&config_dir).ok();
        config_dir.join(SYNC_STATE_FILE)
    }

    fn load_state() -> LocalSyncState {
        let path = Self::state_file_path();
        if path.exists() {
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(state) = serde_json::from_str(&data) {
                    return state;
                }
            }
        }
        LocalSyncState::default()
    }

    fn save_state(state: &LocalSyncState) {
        let path = Self::state_file_path();
        if let Ok(json) = serde_json::to_string_pretty(state) {
            let _ = std::fs::write(path, json);
        }
    }

    pub async fn sync_now(&self, app_handle: Option<&tauri::AppHandle>) -> Result<SyncReport, String> {
        let config = self.config.lock().await.clone()
            .ok_or("No storage configured")?;
        let library_path = self.library_path.lock().await.clone()
            .ok_or("No library path configured")?;

        // Mark as syncing
        {
            let mut status = self.status.lock().await;
            if status.syncing {
                return Err("Sync already in progress".to_string());
            }
            status.syncing = true;
            status.error = None;
        }

        if let Some(handle) = app_handle {
            let _ = handle.emit("sync-progress", serde_json::json!({"stage": "starting"}));
        }

        let result = self.do_sync(&config, &library_path, app_handle).await;

        // Update status
        {
            let mut status = self.status.lock().await;
            status.syncing = false;
            match &result {
                Ok(report) => {
                    status.last_sync = Some(Utc::now().to_rfc3339());
                    status.pending_up = 0;
                    status.pending_down = 0;
                    status.error = if report.errors.is_empty() {
                        None
                    } else {
                        Some(report.errors.join("; "))
                    };
                }
                Err(e) => {
                    status.error = Some(e.clone());
                }
            }
        }

        if let Some(handle) = app_handle {
            match &result {
                Ok(report) => {
                    let _ = handle.emit("sync-complete", serde_json::to_value(report).unwrap_or_default());
                }
                Err(e) => {
                    let _ = handle.emit("sync-complete", serde_json::json!({"error": e}));
                }
            }
        }

        result
    }

    async fn do_sync(
        &self,
        config: &StorageConfig,
        library_path: &str,
        app_handle: Option<&tauri::AppHandle>,
    ) -> Result<SyncReport, String> {
        let provider = create_provider(config)?;
        let lib_path = Path::new(library_path);

        let mut report = SyncReport {
            uploaded: Vec::new(),
            downloaded: Vec::new(),
            deleted_remote: Vec::new(),
            deleted_local: Vec::new(),
            conflicts: Vec::new(),
            errors: Vec::new(),
            metadata_synced: false,
        };

        // 1. List local files
        let local_files = scan_local_books(lib_path)?;

        if let Some(handle) = app_handle {
            let _ = handle.emit("sync-progress", serde_json::json!({
                "stage": "listing_remote",
                "local_count": local_files.len()
            }));
        }

        // 2. List remote files
        let remote_files = provider.list_files("").await?;

        // 3. Read remote .klio-sync.json
        let remote_meta = match read_json(provider.as_ref(), SYNC_META_FILE).await {
            Ok(json) => serde_json::from_str::<KlioSyncData>(&json).unwrap_or_default(),
            Err(e) if e == "NotFound" => KlioSyncData::default(),
            Err(e) => {
                report.errors.push(format!("Read sync meta: {}", e));
                KlioSyncData::default()
            }
        };

        // 4. Load local sync state
        let mut local_state = Self::load_state();

        // Build maps
        let remote_map: HashMap<String, &RemoteFile> = remote_files
            .iter()
            .filter(|f| f.key != SYNC_META_FILE)
            .map(|f| (f.key.clone(), f))
            .collect();

        let local_map: HashMap<String, LocalFileInfo> = local_files
            .iter()
            .map(|f| (f.filename.clone(), f.clone()))
            .collect();

        if let Some(handle) = app_handle {
            let _ = handle.emit("sync-progress", serde_json::json!({
                "stage": "comparing",
                "local_count": local_map.len(),
                "remote_count": remote_map.len()
            }));
        }

        // 5. Compare and sync
        // Files only local → upload
        for (filename, local_info) in &local_map {
            if !remote_map.contains_key(filename) {
                // Check if was previously synced and deleted remotely
                let was_synced = local_state.file_hashes.contains_key(filename);
                if was_synced {
                    // Remote was deleted, skip upload (respect remote deletion)
                    // But if local was modified since last sync, upload
                    let prev = local_state.file_hashes.get(filename);
                    if let Some(prev) = prev {
                        if prev.md5 != local_info.md5 {
                            // Local modified after remote delete → upload
                            match provider.upload(&local_info.path, filename).await {
                                Ok(()) => report.uploaded.push(filename.clone()),
                                Err(e) => report.errors.push(format!("Upload {}: {}", filename, e)),
                            }
                        }
                    }
                } else {
                    // New local file → upload
                    if let Some(handle) = app_handle {
                        let _ = handle.emit("sync-progress", serde_json::json!({
                            "stage": "uploading",
                            "file": filename
                        }));
                    }
                    match provider.upload(&local_info.path, filename).await {
                        Ok(()) => report.uploaded.push(filename.clone()),
                        Err(e) => report.errors.push(format!("Upload {}: {}", filename, e)),
                    }
                }
            }
        }

        // Files only remote → download
        for (filename, _remote_info) in &remote_map {
            if !local_map.contains_key(filename) {
                let was_synced = local_state.file_hashes.contains_key(filename);
                if was_synced {
                    // Was synced before, now local deleted → respect local deletion
                    let prev = local_state.file_hashes.get(filename);
                    if let Some(_prev) = prev {
                        // Local was deleted → skip download
                    }
                } else {
                    // New remote file → download
                    if let Some(handle) = app_handle {
                        let _ = handle.emit("sync-progress", serde_json::json!({
                            "stage": "downloading",
                            "file": filename
                        }));
                    }
                    let local_path = lib_path.join(filename);
                    match provider.download(filename, &local_path.to_string_lossy()).await {
                        Ok(()) => report.downloaded.push(filename.clone()),
                        Err(e) => report.errors.push(format!("Download {}: {}", filename, e)),
                    }
                }
            }
        }

        // Files in both → check for updates
        for (filename, local_info) in &local_map {
            if let Some(_remote_info) = remote_map.get(filename) {
                let prev_state = local_state.file_hashes.get(filename);

                if let Some(prev) = prev_state {
                    let local_changed = prev.md5 != local_info.md5;
                    // We can't easily compare remote MD5 without downloading,
                    // so we check if remote has metadata changes
                    let remote_meta_entry = remote_meta.books.get(filename);
                    let remote_changed = remote_meta_entry
                        .map(|m| m.last_modified != prev.last_modified)
                        .unwrap_or(false);

                    if local_changed && remote_changed {
                        // Conflict! Both modified
                        report.conflicts.push(filename.clone());
                        if let Some(handle) = app_handle {
                            let _ = handle.emit("sync-conflict", serde_json::json!({
                                "file": filename,
                                "local_modified": local_info.last_modified,
                            }));
                        }
                    } else if local_changed {
                        // Local newer → upload
                        match provider.upload(&local_info.path, filename).await {
                            Ok(()) => report.uploaded.push(filename.clone()),
                            Err(e) => report.errors.push(format!("Upload {}: {}", filename, e)),
                        }
                    }
                    // If only remote changed, the content is already there
                    // (we'd need to download to get the new version)
                }
            }
        }

        // 6. Update remote .klio-sync.json
        let mut new_meta = remote_meta;
        for (filename, local_info) in &local_map {
            let entry = new_meta.books.entry(filename.clone()).or_insert_with(|| BookSyncMeta {
                filename: filename.clone(),
                size: local_info.size,
                last_modified: local_info.last_modified.clone(),
                progress: None,
                notes: Vec::new(),
                bookmarks: Vec::new(),
            });
            entry.size = local_info.size;
            entry.last_modified = local_info.last_modified.clone();
        }
        // Also add downloaded files
        for filename in &report.downloaded {
            let local_path = lib_path.join(filename);
            if let Ok(meta) = std::fs::metadata(&local_path) {
                new_meta.books.entry(filename.clone()).or_insert_with(|| BookSyncMeta {
                    filename: filename.clone(),
                    size: meta.len(),
                    last_modified: Utc::now().to_rfc3339(),
                    progress: None,
                    notes: Vec::new(),
                    bookmarks: Vec::new(),
                });
            }
        }
        new_meta.last_sync = Utc::now().to_rfc3339();

        if let Ok(meta_json) = serde_json::to_string_pretty(&new_meta) {
            match write_json(provider.as_ref(), SYNC_META_FILE, &meta_json).await {
                Ok(()) => report.metadata_synced = true,
                Err(e) => report.errors.push(format!("Write sync meta: {}", e)),
            }
        }

        // 7. Update local sync state
        local_state.last_sync = Utc::now().to_rfc3339();
        local_state.file_hashes.clear();
        // Re-scan to get current state
        let current_files = scan_local_books(lib_path).unwrap_or_default();
        for f in current_files {
            local_state.file_hashes.insert(f.filename.clone(), FileState {
                md5: f.md5,
                size: f.size,
                last_modified: f.last_modified,
            });
        }
        Self::save_state(&local_state);

        Ok(report)
    }

    pub async fn update_book_progress(
        &self,
        filename: &str,
        progress: BookProgress,
    ) -> Result<(), String> {
        let config = self.config.lock().await.clone()
            .ok_or("No storage configured")?;

        let provider = create_provider(&config)?;

        // Read current meta
        let mut meta = match read_json(provider.as_ref(), SYNC_META_FILE).await {
            Ok(json) => serde_json::from_str::<KlioSyncData>(&json).unwrap_or_default(),
            Err(_) => KlioSyncData::default(),
        };

        // Update progress for this book
        if let Some(entry) = meta.books.get_mut(filename) {
            entry.progress = Some(progress);
        } else {
            meta.books.insert(filename.to_string(), BookSyncMeta {
                filename: filename.to_string(),
                size: 0,
                last_modified: Utc::now().to_rfc3339(),
                progress: Some(progress),
                notes: Vec::new(),
                bookmarks: Vec::new(),
            });
        }

        let json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
        write_json(provider.as_ref(), SYNC_META_FILE, &json).await
    }

    pub async fn get_book_progress(&self, filename: &str) -> Result<Option<BookProgress>, String> {
        let config = self.config.lock().await.clone()
            .ok_or("No storage configured")?;

        let provider = create_provider(&config)?;

        let meta = match read_json(provider.as_ref(), SYNC_META_FILE).await {
            Ok(json) => serde_json::from_str::<KlioSyncData>(&json).unwrap_or_default(),
            Err(e) if e == "NotFound" => return Ok(None),
            Err(e) => return Err(e),
        };

        Ok(meta.books.get(filename).and_then(|b| b.progress.clone()))
    }

    pub async fn start_auto_sync(&self, app_handle: tauri::AppHandle) {
        self.stop_auto_sync().await;

        let interval = {
            self.status.lock().await.auto_sync_interval_secs
        };

        {
            self.status.lock().await.auto_sync_enabled = true;
        }

        let config = self.config.clone();
        let library_path = self.library_path.clone();
        let status = self.status.clone();

        let handle = tokio::spawn(async move {
            let mut interval_timer = tokio::time::interval(
                tokio::time::Duration::from_secs(interval),
            );
            // Skip the first immediate tick
            interval_timer.tick().await;

            loop {
                interval_timer.tick().await;

                // Check if still enabled
                let enabled = status.lock().await.auto_sync_enabled;
                if !enabled {
                    break;
                }

                // Check if config is set
                let has_config = config.lock().await.is_some();
                let has_path = library_path.lock().await.is_some();
                if !has_config || !has_path {
                    continue;
                }

                // Create a temporary sync engine for this run
                let temp_engine = SyncEngine::new();
                {
                    let c = config.lock().await.clone();
                    let p = library_path.lock().await.clone();
                    if let (Some(c), Some(p)) = (c, p) {
                        temp_engine.configure(c, p).await;
                        let _ = temp_engine.sync_now(Some(&app_handle)).await;
                    }
                }
            }
        });

        *self.auto_sync_handle.lock().await = Some(handle);
    }

    pub async fn stop_auto_sync(&self) {
        self.status.lock().await.auto_sync_enabled = false;
        if let Some(handle) = self.auto_sync_handle.lock().await.take() {
            handle.abort();
        }
    }

    pub async fn set_auto_sync_interval(&self, secs: u64) {
        self.status.lock().await.auto_sync_interval_secs = secs;
    }

    pub async fn list_remote(&self) -> Result<Vec<RemoteFile>, String> {
        let config = self.config.lock().await.clone()
            .ok_or("No storage configured")?;
        let provider = create_provider(&config)?;
        provider.list_files("").await
    }
}

#[derive(Debug, Clone)]
struct LocalFileInfo {
    filename: String,
    path: String,
    md5: String,
    size: u64,
    last_modified: String,
}

fn scan_local_file(path: &Path, prefix: &str) -> Result<Option<LocalFileInfo>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    if !matches!(ext.to_lowercase().as_str(), "epub" | "pdf" | "cbz" | "cbr") {
        return Ok(None);
    }

    let basename = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    if basename.is_empty() {
        return Ok(None);
    }

    let filename = if prefix.is_empty() {
        basename.clone()
    } else {
        format!("{}/{}", prefix, basename)
    };

    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let size = metadata.len();

    let data = std::fs::read(path).map_err(|e| format!("Read {}: {}", filename, e))?;
    let mut hasher = Md5::new();
    hasher.update(&data);
    let md5 = hex::encode(hasher.finalize());

    let last_modified = metadata
        .modified()
        .ok()
        .and_then(|t| {
            let dt: chrono::DateTime<Utc> = t.into();
            Some(dt.to_rfc3339())
        })
        .unwrap_or_default();

    Ok(Some(LocalFileInfo {
        filename,
        path: path.to_string_lossy().to_string(),
        md5,
        size,
        last_modified,
    }))
}

fn scan_local_books(dir: &Path) -> Result<Vec<LocalFileInfo>, String> {
    let mut files = Vec::new();
    if !dir.exists() {
        return Ok(files);
    }

    let entries = std::fs::read_dir(dir).map_err(|e| format!("Read dir: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_file() {
            if let Some(info) = scan_local_file(&path, "")? {
                files.push(info);
            }
        } else if path.is_dir() {
            // Escanear subcarpetas un nivel (sagas)
            let folder_name = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            if folder_name.starts_with('.') || folder_name.is_empty() {
                continue;
            }

            if let Ok(sub_entries) = std::fs::read_dir(&path) {
                for sub_entry in sub_entries {
                    if let Ok(sub_entry) = sub_entry {
                        let sub_path = sub_entry.path();
                        if let Some(info) = scan_local_file(&sub_path, &folder_name)? {
                            files.push(info);
                        }
                    }
                }
            }
        }
    }

    Ok(files)
}
