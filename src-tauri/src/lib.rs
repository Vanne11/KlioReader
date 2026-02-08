use serde::{Serialize, Deserialize};
use std::path::Path;
use epub::doc::EpubDoc;
use lopdf::Document;
use base64::{Engine as _, engine::general_purpose};

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
fn read_epub_chapter(path: String, chapter_index: usize) -> Result<String, String> {
    let mut doc = EpubDoc::new(path).map_err(|e| e.to_string())?;
    if chapter_index >= doc.get_num_chapters() {
        return Err("Chapter index out of bounds".to_string());
    }
    doc.set_current_chapter(chapter_index);
    doc.get_current_str().map(|(content, _mime)| content).ok_or_else(|| "Failed to get chapter content".to_string())
}

#[tauri::command]
fn read_epub_resource(path: String, resource_path: String) -> Result<(Vec<u8>, String), String> {
    let mut doc = EpubDoc::new(path).map_err(|e| e.to_string())?;
    
    // Buscamos el recurso en el manifiesto para obtener el mime type
    let mime = doc.resources.get(&resource_path)
        .map(|r| r.mime.clone())
        .unwrap_or_else(|| "image/jpeg".to_string()); // fallback común

    let data = doc.get_resource_by_path(&resource_path)
       .ok_or_else(|| format!("Resource not found: {}", resource_path))?;
       
    Ok((data, mime))
}

#[tauri::command]
fn get_metadata(path: String) -> Result<BookMetadata, String> {
    let path = Path::new(&path);
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    match extension.to_lowercase().as_str() {
        "epub" => read_epub_metadata(path),
        "pdf" => read_pdf_metadata(path),
        _ => Err("Unsupported format".to_string()),
    }
}

#[tauri::command]
fn scan_directory(dir_path: String) -> Result<Vec<(String, BookMetadata)>, String> {
    let mut books = Vec::new();
    let path = Path::new(&dir_path);
    if path.is_dir() {
        for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let file_path = entry.path();
            if file_path.is_file() {
                let ext = file_path.extension().and_then(|s| s.to_str()).unwrap_or("");
                if ext == "epub" || ext == "pdf" {
                    if let Ok(meta) = get_metadata(file_path.to_string_lossy().to_string()) {
                        books.push((file_path.to_string_lossy().to_string(), meta));
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
fn get_default_library_path() -> Result<String, String> {
    let mut path = dirs::document_dir()
        .ok_or_else(|| "No se pudo encontrar la carpeta de documentos".to_string())?;
    
    path.push("KlioReader3");
    
    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    
    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_metadata, 
            read_epub_chapter, 
            scan_directory, 
            get_random_snippet,
            get_default_library_path,
            read_epub_resource,
            read_file_bytes,
            save_file_bytes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
