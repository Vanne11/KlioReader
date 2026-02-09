-- KlioReader3 Database Schema
-- SQLite 3

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT NULL,
    selected_title_id TEXT DEFAULT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    streak INTEGER DEFAULT 0,
    last_streak_date TEXT DEFAULT NULL,
    role TEXT DEFAULT 'user',
    upload_limit INTEGER DEFAULT 524288000,
    storage_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    author TEXT DEFAULT '',
    description TEXT DEFAULT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    file_type TEXT NOT NULL CHECK(file_type IN ('epub', 'pdf')),
    cover_base64 TEXT DEFAULT NULL,
    total_chapters INTEGER DEFAULT 0,
    storage_type TEXT DEFAULT 'local',
    storage_file_id TEXT DEFAULT NULL,
    book_hash TEXT DEFAULT NULL,
    stored_file_id INTEGER DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reading_progress (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    current_chapter INTEGER DEFAULT 0,
    current_page INTEGER DEFAULT 0,
    progress_percent INTEGER DEFAULT 0,
    last_read TEXT DEFAULT (datetime('now')),
    UNIQUE (user_id, book_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    chapter_index INTEGER DEFAULT 0,
    content TEXT NOT NULL,
    highlight_text TEXT DEFAULT NULL,
    color TEXT DEFAULT '#ffeb3b',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    page_index INTEGER DEFAULT 0,
    label TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS progress_archive (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    book_hash TEXT NOT NULL,
    current_chapter INTEGER DEFAULT 0,
    current_page INTEGER DEFAULT 0,
    progress_percent INTEGER DEFAULT 0,
    last_read TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, book_hash)
);

INSERT OR IGNORE INTO site_settings (key, value) VALUES
    ('site_name', 'KlioReader'),
    ('site_description', 'Tu biblioteca digital personal'),
    ('hero_title', 'Lee sin limites'),
    ('hero_subtitle', 'Tu biblioteca digital personal, siempre contigo'),
    ('default_upload_limit', '524288000'),
    ('storage_provider', 'local'),
    ('b2_key_id', ''),
    ('b2_app_key', ''),
    ('b2_bucket_name', ''),
    ('b2_bucket_id', ''),
    ('s3_access_key', ''),
    ('s3_secret_key', ''),
    ('s3_bucket', ''),
    ('s3_region', 'us-east-1'),
    ('s3_endpoint', ''),
    ('gcs_access_key', ''),
    ('gcs_secret_key', ''),
    ('gcs_bucket', ''),
    ('gdrive_key_file', ''),
    ('gdrive_folder_id', ''),
    ('registration_enabled', '1'),
    ('registration_closed_message', 'Por ahora no estamos aceptando registros. Muchas gracias por tu interes.');

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

CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_book ON notes(book_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(book_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_user_book ON reading_progress(user_id, book_id);
CREATE INDEX IF NOT EXISTS idx_stored_files_hash ON stored_files(file_hash);
