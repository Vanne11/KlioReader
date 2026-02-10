use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, Debouncer, NoCache};
use notify::RecommendedWatcher;
use tauri::Emitter;

const VALID_EXTENSIONS: &[&str] = &["epub", "pdf", "cbz", "cbr"];

pub struct LibraryWatcher {
    debouncer: Option<Debouncer<RecommendedWatcher, NoCache>>,
    watched_path: Option<PathBuf>,
}

impl LibraryWatcher {
    pub fn new() -> Self {
        Self {
            debouncer: None,
            watched_path: None,
        }
    }

    pub fn start(&mut self, path: PathBuf, app_handle: tauri::AppHandle) -> Result<(), String> {
        // Si ya estamos vigilando esta misma ruta, no hacer nada
        if self.watched_path.as_ref() == Some(&path) && self.debouncer.is_some() {
            return Ok(());
        }

        // Parar watcher anterior si existe
        self.stop();

        let mut debouncer = new_debouncer(
            Duration::from_secs(2),
            None,
            move |result: notify_debouncer_full::DebounceEventResult| {
                match result {
                    Ok(events) => {
                        if has_relevant_changes(&events) {
                            let _ = app_handle.emit("library-changed", ());
                        }
                    }
                    Err(errors) => {
                        eprintln!("[watcher] Errores: {:?}", errors);
                    }
                }
            },
        )
        .map_err(|e| format!("Error creando watcher: {}", e))?;

        debouncer
            .watch(&path, RecursiveMode::Recursive)
            .map_err(|e| format!("Error vigilando directorio: {}", e))?;

        self.debouncer = Some(debouncer);
        self.watched_path = Some(path);
        Ok(())
    }

    pub fn stop(&mut self) {
        self.debouncer = None;
        self.watched_path = None;
    }
}

fn has_relevant_changes(events: &[notify_debouncer_full::DebouncedEvent]) -> bool {
    events.iter().any(|event| {
        event.event.paths.iter().any(|p| {
            // Cambios en directorios son relevantes (nueva saga, renombrar carpeta)
            if p.is_dir() {
                return true;
            }
            // Verificar extensión del archivo
            p.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| VALID_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
        })
    })
}

pub struct LibraryWatcherState(pub Arc<tokio::sync::Mutex<LibraryWatcher>>);

#[tauri::command]
pub async fn start_library_watcher(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, LibraryWatcherState>,
) -> Result<(), String> {
    let mut watcher = state.0.lock().await;
    watcher.start(PathBuf::from(path), app)
}

#[tauri::command]
pub async fn stop_library_watcher(
    state: tauri::State<'_, LibraryWatcherState>,
) -> Result<(), String> {
    let mut watcher = state.0.lock().await;
    watcher.stop();
    Ok(())
}
