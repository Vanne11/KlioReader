-- Migración 010: Permitir formatos de cómic (cbr, cbz) en books.file_type
-- SQLite no permite ALTER CHECK constraint, hay que recrear la tabla

CREATE TABLE IF NOT EXISTS books_new (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    author TEXT DEFAULT '',
    description TEXT DEFAULT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    file_type TEXT NOT NULL CHECK(file_type IN ('epub', 'pdf', 'cbr', 'cbz')),
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

INSERT INTO books_new SELECT * FROM books;

DROP TABLE books;

ALTER TABLE books_new RENAME TO books;

CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id);
