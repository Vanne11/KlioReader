-- Migración 005: Agregar columna stored_file_id a books
-- Esta columna faltaba en la migración 003 original
ALTER TABLE books ADD COLUMN stored_file_id INTEGER DEFAULT NULL;
