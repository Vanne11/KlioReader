mod storage;

use serde::{Serialize, Deserialize};
use std::path::Path;
use std::io::{Read as IoRead, Write as IoWrite, Cursor};
use tauri::Manager;
use std::sync::Arc;
use epub::doc::EpubDoc;
use lopdf::Document;
use base64::{Engine as _, engine::general_purpose};
use storage::commands::SyncEngineState;
use storage::sync_engine::SyncEngine;

const IMAGE_EXTS: &[&str] = &[".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".jxl", ".avif"];

#[derive(Serialize, Deserialize, Clone)]
struct BookMetadata {
    title: String,
    author: String,
    cover: Option<String>,
    description: Option<String>,
    publisher: Option<String>,
    language: Option<String>,
    date: Option<String>,
    subject: Option<String>,
    total_chapters: usize,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn read_epub_metadata(path: &Path) -> Result<BookMetadata, String> {
    let mut doc = EpubDoc::new(path).map_err(|e| e.to_string())?;
    
    let title = doc.mdata("title").map(|m| m.value.clone()).unwrap_or_else(|| "Unknown Title".to_string());
    let author = doc.mdata("creator").map(|m| m.value.clone()).unwrap_or_else(|| "Unknown Author".to_string());
    let description = doc.mdata("description").map(|m| m.value.clone());
    let publisher = doc.mdata("publisher").map(|m| m.value.clone());
    let language = doc.mdata("language").map(|m| m.value.clone());
    let date = doc.mdata("date").map(|m| m.value.clone());
    let subject = doc.mdata("subject").map(|m| m.value.clone());
    let total_chapters = doc.get_num_chapters();
    
    let cover = doc.get_cover().map(|(data, _mime)| {
        general_purpose::STANDARD.encode(data)
    });

    Ok(BookMetadata { title, author, cover, description, publisher, language, date, subject, total_chapters })
}

fn read_pdf_metadata(path: &Path) -> Result<BookMetadata, String> {
    let doc = Document::load(path).map_err(|e| e.to_string())?;
    let total_chapters = doc.get_pages().len();
    
    let info_obj = doc.trailer.get(b"Info").ok();
    let info = if let Some(obj) = info_obj {
        if let Ok(id) = obj.as_reference() {
            doc.get_dictionary(id).ok()
        } else {
            None
        }
    } else {
        None
    };

    let get_field = |key: &[u8]| {
        info.and_then(|dict| dict.get(key).ok())
            .and_then(|obj| {
                if let Ok(s) = obj.as_name_str() { Some(s.to_string()) }
                else if let Ok(s) = obj.as_string() { Some(s.to_string()) }
                else { None }
            })
    };

    let title = get_field(b"Title").unwrap_or_else(|| "Unknown PDF Title".to_string());
    let author = get_field(b"Author").unwrap_or_else(|| "Unknown PDF Author".to_string());

    Ok(BookMetadata { 
        title, 
        author, 
        cover: None, 
        description: get_field(b"Subject"), 
        publisher: get_field(b"Producer"), 
        language: None, 
        date: get_field(b"CreationDate"), 
        subject: get_field(b"Subject"),
        total_chapters
    })
}

#[tauri::command]
fn read_epub_resource(path: String, resource_path: String) -> Result<(Vec<u8>, String), String> {
    let mut doc = EpubDoc::new(path).map_err(|e| e.to_string())?;

    // Intento 1: buscar por path exacto
    if let Some(data) = doc.get_resource_by_path(&resource_path) {
        let mime = doc.resources.values()
            .find(|r| r.path == std::path::PathBuf::from(&resource_path))
            .map(|r| r.mime.clone())
            .unwrap_or_else(|| "image/jpeg".to_string());
        return Ok((data, mime));
    }

    // Intento 2: buscar recurso cuyo path termine con el resource_path solicitado
    let matching = doc.resources.iter()
        .find(|(_id, r)| {
            let p = r.path.to_string_lossy();
            p.ends_with(&resource_path) || p.ends_with(&format!("/{}", resource_path))
        });

    if let Some((id, _res)) = matching {
        let id_clone = id.clone();
        let (data, mime) = doc.get_resource(&id_clone)
            .ok_or_else(|| format!("Resource not found by id: {}", id_clone))?;
        return Ok((data, mime));
    }

    // Intento 3: buscar solo por nombre de archivo
    let filename = resource_path.split('/').last().unwrap_or(&resource_path);
    let matching_by_name = doc.resources.iter()
        .find(|(_id, r)| {
            r.path.file_name()
                .map(|f| f.to_string_lossy() == filename)
                .unwrap_or(false)
        });

    if let Some((id, _res)) = matching_by_name {
        let id_clone = id.clone();
        let (data, mime) = doc.get_resource(&id_clone)
            .ok_or_else(|| format!("Resource not found by id: {}", id_clone))?;
        return Ok((data, mime));
    }

    Err(format!("Resource not found: {}", resource_path))
}

fn is_image_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    IMAGE_EXTS.iter().any(|ext| lower.ends_with(ext))
}

fn read_cbz_metadata(path: &Path) -> Result<BookMetadata, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut image_names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .filter(|name| is_image_file(name))
        .collect();
    image_names.sort();

    let total_chapters = image_names.len();
    let title = path.file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Comic".to_string());

    // Extraer primera imagen como portada
    let cover = if let Some(first) = image_names.first() {
        if let Ok(mut entry) = archive.by_name(first) {
            let mut buf = Vec::new();
            if entry.read_to_end(&mut buf).is_ok() {
                Some(general_purpose::STANDARD.encode(&buf))
            } else { None }
        } else { None }
    } else { None };

    Ok(BookMetadata {
        title,
        author: "Unknown".to_string(),
        cover,
        description: Some(format!("{} páginas", total_chapters)),
        publisher: None,
        language: None,
        date: None,
        subject: Some("Comic".to_string()),
        total_chapters,
    })
}

fn read_cbr_metadata(path: &Path) -> Result<BookMetadata, String> {
    let archive = unrar::Archive::new(path).open_for_listing()
        .map_err(|e| format!("Error abriendo CBR: {}", e))?;

    let mut image_names: Vec<String> = Vec::new();
    for entry in archive {
        if let Ok(entry) = entry {
            let name = entry.filename.to_string_lossy().to_string();
            if entry.is_file() && is_image_file(&name) {
                image_names.push(name);
            }
        }
    }
    image_names.sort();

    let total_chapters = image_names.len();
    let title = path.file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Comic".to_string());

    // Extraer primera imagen como portada
    let cover = if let Some(first_name) = image_names.first() {
        let first_clone = first_name.clone();
        extract_first_rar_image(path, &first_clone)
            .map(|data| general_purpose::STANDARD.encode(&data))
    } else { None };

    Ok(BookMetadata {
        title,
        author: "Unknown".to_string(),
        cover,
        description: Some(format!("{} páginas", total_chapters)),
        publisher: None,
        language: None,
        date: None,
        subject: Some("Comic".to_string()),
        total_chapters,
    })
}

fn extract_first_rar_image(path: &Path, target_name: &str) -> Option<Vec<u8>> {
    let archive = unrar::Archive::new(path).open_for_processing().ok()?;
    let mut cursor = archive;
    loop {
        match cursor.read_header() {
            Ok(Some(header)) => {
                let name = header.entry().filename.to_string_lossy().to_string();
                if name == target_name {
                    return header.read().ok().map(|(data, _)| data);
                }
                cursor = header.skip().ok()?;
            }
            _ => return None,
        }
    }
}

#[tauri::command]
fn convert_cbr_to_cbz(path: String) -> Result<Vec<u8>, String> {
    let archive = unrar::Archive::new(&path).open_for_processing()
        .map_err(|e| format!("Error abriendo CBR: {}", e))?;

    // Extraer todas las imágenes del RAR
    let mut images: Vec<(String, Vec<u8>)> = Vec::new();
    let mut cursor = archive;

    loop {
        match cursor.read_header() {
            Ok(Some(header)) => {
                let name = header.entry().filename.to_string_lossy().to_string();
                let is_file = header.entry().is_file();

                if is_file && is_image_file(&name) {
                    match header.read() {
                        Ok((data, next)) => {
                            images.push((name, data));
                            cursor = next;
                        }
                        Err(e) => return Err(format!("Error leyendo entrada RAR: {}", e)),
                    }
                } else {
                    match header.skip() {
                        Ok(next) => cursor = next,
                        Err(e) => return Err(format!("Error saltando entrada RAR: {}", e)),
                    }
                }
            }
            Ok(None) => break,
            Err(e) => return Err(format!("Error leyendo header RAR: {}", e)),
        }
    }

    images.sort_by(|a, b| a.0.cmp(&b.0));

    // Crear ZIP en memoria
    let mut buf = Cursor::new(Vec::new());
    {
        let mut zip_writer = zip::ZipWriter::new(&mut buf);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);

        for (name, data) in &images {
            zip_writer.start_file(name.as_str(), options)
                .map_err(|e| format!("Error creando entrada ZIP: {}", e))?;
            zip_writer.write_all(data)
                .map_err(|e| format!("Error escribiendo en ZIP: {}", e))?;
        }

        zip_writer.finish().map_err(|e| format!("Error finalizando ZIP: {}", e))?;
    }

    Ok(buf.into_inner())
}

#[tauri::command]
fn get_metadata(path: String) -> Result<BookMetadata, String> {
    let path = Path::new(&path);
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    match extension.to_lowercase().as_str() {
        "epub" => read_epub_metadata(path),
        "pdf" => read_pdf_metadata(path),
        "cbz" => read_cbz_metadata(path),
        "cbr" => read_cbr_metadata(path),
        _ => Err("Unsupported format".to_string()),
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct ScanResult {
    path: String,
    metadata: BookMetadata,
    subfolder: Option<String>,
    inferred_order: Option<u32>,
    display_name: Option<String>,
}

fn infer_order_from_filename(filename: &str) -> Option<u32> {
    // Extraer el primer número del nombre de archivo (sin extensión)
    let stem = Path::new(filename).file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);

    let mut num_str = String::new();
    let mut found = false;

    for ch in stem.chars() {
        if ch.is_ascii_digit() {
            num_str.push(ch);
            found = true;
        } else if found {
            break;
        }
    }

    if found {
        num_str.parse::<u32>().ok()
    } else {
        None
    }
}

fn scan_book_entry(file_path: &Path, subfolder: Option<String>) -> Option<ScanResult> {
    let ext = file_path.extension().and_then(|s| s.to_str()).unwrap_or("");
    if !matches!(ext.to_lowercase().as_str(), "epub" | "pdf" | "cbz" | "cbr") {
        return None;
    }

    let meta = get_metadata(file_path.to_string_lossy().to_string()).ok()?;
    let filename = file_path.file_name()?.to_str()?;

    let inferred_order = if subfolder.is_some() {
        infer_order_from_filename(filename)
    } else {
        None
    };

    let display_name = match (&subfolder, inferred_order) {
        (Some(folder), Some(order)) => Some(format!("{} #{}", folder, order)),
        _ => None,
    };

    Some(ScanResult {
        path: file_path.to_string_lossy().to_string(),
        metadata: meta,
        subfolder,
        inferred_order,
        display_name,
    })
}

#[tauri::command]
fn scan_directory(dir_path: String) -> Result<Vec<ScanResult>, String> {
    let mut books = Vec::new();
    let path = Path::new(&dir_path);
    if !path.is_dir() {
        return Ok(books);
    }

    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_path = entry.path();

        if file_path.is_file() {
            if let Some(result) = scan_book_entry(&file_path, None) {
                books.push(result);
            }
        } else if file_path.is_dir() {
            // Escanear un nivel de subcarpetas (sagas)
            let folder_name = file_path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            // Ignorar carpetas ocultas
            if folder_name.starts_with('.') {
                continue;
            }

            if let Ok(sub_entries) = std::fs::read_dir(&file_path) {
                for sub_entry in sub_entries {
                    if let Ok(sub_entry) = sub_entry {
                        let sub_path = sub_entry.path();
                        if sub_path.is_file() {
                            if let Some(result) = scan_book_entry(&sub_path, Some(folder_name.clone())) {
                                books.push(result);
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(books)
}

#[tauri::command]
fn get_random_snippet(path: String) -> Result<String, String> {
    let mut doc = EpubDoc::new(path).map_err(|e| e.to_string())?;
    let num_chapters = doc.get_num_chapters();
    if num_chapters == 0 { return Err("Empty book".to_string()); }
    let random_chapter = if num_chapters > 3 { (rand::random::<usize>() % (num_chapters - 2)) + 1 } else { 0 };
    doc.set_current_chapter(random_chapter);
    let (content, _) = doc.get_current_str().ok_or("No content")?;
    let plain_text = content.replace("<", " <").replace(">", "> ");
    let words: Vec<&str> = plain_text.split_whitespace().collect();
    let limit = std::cmp::min(words.len(), 500);
    Ok(words[..limit].join(" "))
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Error leyendo archivo: {}", e))
}

#[tauri::command]
fn save_file_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &bytes).map_err(|e| format!("Error guardando archivo: {}", e))
}

#[tauri::command]
fn copy_file(src: String, dest: String) -> Result<(), String> {
    std::fs::copy(&src, &dest)
        .map(|_| ())
        .map_err(|e| format!("Error copiando archivo: {}", e))
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn is_mobile_platform() -> bool {
    cfg!(target_os = "android") || cfg!(target_os = "ios")
}

#[tauri::command]
fn get_default_library_path(app: tauri::AppHandle) -> Result<String, String> {
    let path = if cfg!(target_os = "android") || cfg!(target_os = "ios") {
        // En móvil, usar el directorio de datos de la app (no requiere permisos extra)
        let base = app.path().app_data_dir()
            .map_err(|e| format!("No se pudo obtener directorio de datos: {}", e))?;
        base.join("library")
    } else {
        let mut p = dirs::document_dir()
            .ok_or_else(|| "No se pudo encontrar la carpeta de documentos".to_string())?;
        p.push("KlioReader3");
        p
    };

    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn create_subfolder(base_path: String, folder_name: String) -> Result<String, String> {
    let path = Path::new(&base_path).join(&folder_name);
    std::fs::create_dir_all(&path).map_err(|e| format!("Error creando carpeta: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn move_file_to_subfolder(file_path: String, dest_folder: String) -> Result<String, String> {
    let src = Path::new(&file_path);
    let filename = src.file_name()
        .ok_or_else(|| "No se pudo obtener el nombre del archivo".to_string())?;
    let dest = Path::new(&dest_folder).join(filename);

    // Crear carpeta destino si no existe
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Error creando directorio: {}", e))?;
    }

    std::fs::rename(&src, &dest).map_err(|e| format!("Error moviendo archivo: {}", e))?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
fn move_file_to_root(file_path: String, library_path: String) -> Result<String, String> {
    let src = Path::new(&file_path);
    let filename = src.file_name()
        .ok_or_else(|| "No se pudo obtener el nombre del archivo".to_string())?;
    let dest = Path::new(&library_path).join(filename);

    std::fs::rename(&src, &dest).map_err(|e| format!("Error moviendo archivo: {}", e))?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
fn rename_file(file_path: String, new_name: String) -> Result<String, String> {
    let src = Path::new(&file_path);
    let parent = src.parent()
        .ok_or_else(|| "No se pudo obtener el directorio padre".to_string())?;
    let dest = parent.join(&new_name);

    std::fs::rename(&src, &dest).map_err(|e| format!("Error renombrando archivo: {}", e))?;
    Ok(dest.to_string_lossy().to_string())
}

#[derive(Serialize)]
struct ComicPages {
    temp_dir: String,
    pages: Vec<String>,
}

#[tauri::command]
fn extract_comic_pages(path: String, book_type: String) -> Result<ComicPages, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let temp_dir = std::env::temp_dir().join(format!("klio-comic-{}", timestamp));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Error creando directorio temporal: {}", e))?;

    let mut image_paths: Vec<String> = Vec::new();

    if book_type == "cbr" {
        // Extraer imágenes del RAR
        let archive = unrar::Archive::new(&path).open_for_processing()
            .map_err(|e| format!("Error abriendo CBR: {}", e))?;

        let mut entries: Vec<(String, Vec<u8>)> = Vec::new();
        let mut cursor = archive;

        loop {
            match cursor.read_header() {
                Ok(Some(header)) => {
                    let name = header.entry().filename.to_string_lossy().to_string();
                    let is_file = header.entry().is_file();

                    if is_file && is_image_file(&name) {
                        match header.read() {
                            Ok((data, next)) => {
                                entries.push((name, data));
                                cursor = next;
                            }
                            Err(e) => return Err(format!("Error leyendo entrada RAR: {}", e)),
                        }
                    } else {
                        match header.skip() {
                            Ok(next) => cursor = next,
                            Err(e) => return Err(format!("Error saltando entrada RAR: {}", e)),
                        }
                    }
                }
                Ok(None) => break,
                Err(e) => return Err(format!("Error leyendo header RAR: {}", e)),
            }
        }

        entries.sort_by(|a, b| a.0.cmp(&b.0));

        for (i, (_name, data)) in entries.iter().enumerate() {
            let ext = _name.rsplit('.').next().unwrap_or("jpg");
            let out_path = temp_dir.join(format!("{:05}.{}", i, ext));
            std::fs::write(&out_path, data)
                .map_err(|e| format!("Error escribiendo imagen: {}", e))?;
            image_paths.push(out_path.to_string_lossy().to_string());
        }
    } else {
        // CBZ (ZIP)
        let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

        let mut names: Vec<String> = (0..archive.len())
            .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
            .filter(|name| is_image_file(name))
            .collect();
        names.sort();

        for (i, name) in names.iter().enumerate() {
            let mut entry = archive.by_name(name)
                .map_err(|e| format!("Error leyendo entrada ZIP: {}", e))?;
            let ext = name.rsplit('.').next().unwrap_or("jpg");
            let out_path = temp_dir.join(format!("{:05}.{}", i, ext));
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)
                .map_err(|e| format!("Error leyendo imagen: {}", e))?;
            std::fs::write(&out_path, &buf)
                .map_err(|e| format!("Error escribiendo imagen: {}", e))?;
            image_paths.push(out_path.to_string_lossy().to_string());
        }
    }

    Ok(ComicPages {
        temp_dir: temp_dir.to_string_lossy().to_string(),
        pages: image_paths,
    })
}

#[tauri::command]
fn cleanup_comic_temp(temp_dir: String) -> Result<(), String> {
    if !temp_dir.contains("klio-comic-") {
        return Err("Directorio no válido para limpieza".to_string());
    }
    std::fs::remove_dir_all(&temp_dir)
        .map_err(|e| format!("Error limpiando directorio temporal: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SyncEngineState(Arc::new(tokio::sync::Mutex::new(SyncEngine::new()))))
        .invoke_handler(tauri::generate_handler![
            greet,
            get_metadata,
            scan_directory,
            get_random_snippet,
            is_mobile_platform,
            get_default_library_path,
            read_epub_resource,
            convert_cbr_to_cbz,
            read_file_bytes,
            save_file_bytes,
            copy_file,
            file_exists,
            create_subfolder,
            move_file_to_subfolder,
            move_file_to_root,
            rename_file,
            extract_comic_pages,
            cleanup_comic_temp,
            storage::commands::user_storage_test_connection,
            storage::commands::user_storage_configure,
            storage::commands::user_storage_sync_now,
            storage::commands::user_storage_start_auto_sync,
            storage::commands::user_storage_stop_auto_sync,
            storage::commands::user_storage_set_auto_sync_interval,
            storage::commands::user_storage_get_status,
            storage::commands::user_storage_list_remote,
            storage::commands::user_storage_update_progress,
            storage::commands::user_storage_get_progress,
            storage::commands::gdrive_start_auth
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
