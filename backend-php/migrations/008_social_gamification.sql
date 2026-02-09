-- 008: Social Gamification - Carreras, Retos, Notas compartidas, Notas de voz

-- Agregar columnas a notes para notas compartidas y notas de voz
ALTER TABLE notes ADD COLUMN is_shared INTEGER DEFAULT 0;
ALTER TABLE notes ADD COLUMN audio_path TEXT DEFAULT NULL;
ALTER TABLE notes ADD COLUMN audio_duration INTEGER DEFAULT NULL;

-- Carreras de lectura
CREATE TABLE IF NOT EXISTS reading_races (
    id INTEGER PRIMARY KEY,
    stored_file_id INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    winner_user_id INTEGER DEFAULT NULL,
    completed_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (stored_file_id) REFERENCES stored_files(id),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (winner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Participantes de carreras
CREATE TABLE IF NOT EXISTS race_participants (
    id INTEGER PRIMARY KEY,
    race_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT DEFAULT (datetime('now')),
    finished_at TEXT DEFAULT NULL,
    FOREIGN KEY (race_id) REFERENCES reading_races(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(race_id, user_id)
);

-- Retos entre amigos
CREATE TABLE IF NOT EXISTS reading_challenges (
    id INTEGER PRIMARY KEY,
    stored_file_id INTEGER NOT NULL,
    challenger_id INTEGER NOT NULL,
    challenged_id INTEGER NOT NULL,
    challenge_type TEXT NOT NULL DEFAULT 'finish_before',
    target_chapters INTEGER DEFAULT NULL,
    target_days INTEGER DEFAULT NULL,
    deadline TEXT DEFAULT NULL,
    status TEXT DEFAULT 'pending',
    winner_user_id INTEGER DEFAULT NULL,
    xp_reward INTEGER DEFAULT 50,
    started_at TEXT DEFAULT NULL,
    completed_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (stored_file_id) REFERENCES stored_files(id),
    FOREIGN KEY (challenger_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (challenged_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (winner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Cache de contadores sociales
CREATE TABLE IF NOT EXISTS social_stats (
    user_id INTEGER PRIMARY KEY,
    books_shared INTEGER DEFAULT 0,
    races_won INTEGER DEFAULT 0,
    races_participated INTEGER DEFAULT 0,
    challenges_completed INTEGER DEFAULT 0,
    challenges_created INTEGER DEFAULT 0,
    shared_notes_count INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indice para notas compartidas
CREATE INDEX IF NOT EXISTS idx_notes_shared ON notes(book_id, is_shared);
