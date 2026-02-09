-- Migración 003: Deduplicación de archivos por MD5
-- Tabla de archivos almacenados (registro permanente, nunca se eliminan)
CREATE TABLE IF NOT EXISTS stored_files (
    id INTEGER PRIMARY KEY,
    file_hash TEXT UNIQUE NOT NULL,
    file_size INTEGER DEFAULT 0,
    file_type TEXT NOT NULL,
    storage_type TEXT DEFAULT 'local',
    storage_file_id TEXT DEFAULT NULL,
    storage_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stored_files_hash ON stored_files(file_hash);

-- Agregar columna stored_file_id a books (enlace al archivo físico deduplicado)
-- SQLite no soporta IF NOT EXISTS en ALTER TABLE, pero install.php verifica antes de ejecutar
ALTER TABLE books ADD COLUMN stored_file_id INTEGER DEFAULT NULL;
