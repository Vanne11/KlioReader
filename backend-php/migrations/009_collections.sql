-- Migración 009: Colecciones y Sagas

CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'collection', -- 'saga' o 'collection'
    cover_base64 TEXT,
    sort_order TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'title', 'added'
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    display_name TEXT,
    added_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(collection_id, book_id),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
    message TEXT,
    snap_name TEXT,
    snap_description TEXT,
    snap_cover_base64 TEXT,
    snap_book_count INTEGER DEFAULT 0,
    snap_type TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_books_collection ON collection_books(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_books_book ON collection_books(book_id);
CREATE INDEX IF NOT EXISTS idx_collection_shares_to_status ON collection_shares(to_user_id, status);
