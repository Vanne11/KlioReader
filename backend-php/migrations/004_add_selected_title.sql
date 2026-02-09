-- Migración 004: Agregar campo selected_title_id a users
-- Almacena el ID de la insignia que el usuario eligió como título
ALTER TABLE users ADD COLUMN selected_title_id TEXT DEFAULT NULL;
