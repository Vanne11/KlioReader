-- Migración 006: Compartir libros entre usuarios
CREATE TABLE IF NOT EXISTS book_shares (
    id INTEGER PRIMARY KEY,
    book_id INTEGER DEFAULT NULL,
    stored_file_id INTEGER NOT NULL,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
    message TEXT DEFAULT NULL,
    snap_title TEXT NOT NULL,
    snap_author TEXT DEFAULT '',
    snap_description TEXT DEFAULT NULL,
    snap_cover_base64 TEXT DEFAULT NULL,
    snap_file_name TEXT NOT NULL,
    snap_file_size INTEGER DEFAULT 0,
    snap_file_type TEXT NOT NULL,
    snap_total_chapters INTEGER DEFAULT 0,
    snap_book_hash TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (stored_file_id) REFERENCES stored_files(id),
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_book_shares_to_status ON book_shares(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_book_shares_from ON book_shares(from_user_id);
CREATE INDEX IF NOT EXISTS idx_book_shares_stored_file ON book_shares(stored_file_id);
