# Sistema de Migraciones - KlioReader

## Resumen
Las migraciones se gestionan desde el **panel admin** (`/admin/migrations.php`).
El sistema detecta automaticamente archivos SQL nuevos y los muestra como pendientes.

## Convencion de archivos
- Ubicacion: `migrations/`
- Formato nombre: `NNN_descripcion.sql` (ej: `010_allow_comic_filetypes.sql`)
- NNN = numero secuencial de 3 digitos
- `schema.sql` es el schema inicial (NO es una migracion numerada)

## Tabla de control
```sql
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    executed_at TEXT DEFAULT (datetime('now')),
    success INTEGER DEFAULT 1,
    error_message TEXT DEFAULT NULL,
    checksum TEXT DEFAULT NULL  -- MD5 del archivo SQL
);
```
Se crea automaticamente al visitar `/admin/migrations.php`.

## Flujo desde el admin
1. `get_migration_files()` escanea `migrations/` buscando archivos `NNN_*.sql`
2. `get_executed_migrations()` consulta tabla `migrations` para saber cuales ya corrieron
3. Las pendientes se muestran en una tabla con boton "Ejecutar" o "Marcar como ejecutada"
4. Al ejecutar: se crea **backup automatico** en `data/backups/`, luego se ejecuta el SQL
5. El SQL se parsea (split por `;`), se limpian comentarios, y se ejecuta statement por statement
6. Errores de "column/table already exists" se ignoran (idempotencia)
7. El resultado (exito/error) se registra en tabla `migrations`

## Como agregar una migracion nueva
1. Crear archivo `NNN_nombre.sql` en `migrations/`
2. Escribir SQL idempotente (usar `IF NOT EXISTS`, `IF EXISTS`, etc.)
3. Agregar ejecucion en `install.php` (para instalaciones nuevas desde cero)
4. En produccion: ir a `/admin/migrations.php` → aparecera como pendiente → click "Ejecutar"

## Nota SQLite
- SQLite NO soporta `ALTER TABLE ... DROP CONSTRAINT` ni `ALTER TABLE ... MODIFY COLUMN`
- Para cambiar CHECK constraints o tipos de columna: recrear la tabla completa
  ```sql
  CREATE TABLE nueva (...);
  INSERT INTO nueva SELECT * FROM vieja;
  DROP TABLE vieja;
  ALTER TABLE nueva RENAME TO vieja;
  -- Recrear indices
  ```

## Acciones disponibles en admin
| Accion | Descripcion |
|--------|-------------|
| Ejecutar | Corre el SQL con backup previo automatico |
| Marcar como ejecutada | Registra sin ejecutar (para migraciones manuales/legacy) |
| Descargar backup | Descarga archivo .db |
| Restaurar backup | Pide motivo, guarda BD actual, restaura la seleccionada |
| Eliminar backup | Borra archivo de backup local |

## Migraciones existentes
| # | Archivo | Descripcion |
|---|---------|-------------|
| - | schema.sql | Schema inicial completo |
| 003 | 003_add_file_dedup.sql | Tabla stored_files, campo stored_file_id en books |
| 004 | 004_add_selected_title.sql | Campo selected_title_id en users |
| 005 | 005_fix_books_stored_file_id.sql | Fix de stored_file_id |
| 006 | 006_book_shares.sql | Tabla book_shares |
| 007 | 007_add_subscriber.sql | Campo is_subscriber en users |
| 008 | 008_social_gamification.sql | Carreras, retos, notas compartidas |
| 009 | 009_collections.sql | Colecciones y sagas |
| 010 | 010_allow_comic_filetypes.sql | CHECK constraint de books.file_type: +cbr, +cbz |

## Directorios
```
backend-php/
├── admin/migrations.php      ← UI y controlador
├── migrations/*.sql          ← Archivos de migracion
├── data/klioreader.db        ← BD principal
├── data/backups/             ← Backups automaticos
│   ├── backup_*.db
│   └── restore_history.json
└── install.php               ← Instalador inicial
```
