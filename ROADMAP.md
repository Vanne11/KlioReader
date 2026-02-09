# KlioReader - Roadmap

## Principios de arquitectura

- **Datos del usuario NUNCA pasan por nuestro servidor.** Las API keys, credenciales de storage y archivos se manejan directamente entre la app del usuario y los servicios externos.
- **El admin configura defaults**, pero cada usuario puede tener su propia configuración de storage/LLM.
- **Offline-first:** La app funciona sin conexión. La nube es un complemento opcional.

---

## Fase 1: Pestaña de Configuración (actual)

- [x] Nueva pestaña "Configuración" en el sidebar
- [x] Ficha **Visualización**: vista de biblioteca (4 modos), visor (scroll/paginado, columnas, tipografía, tamaño, tema)
- [x] Ficha **API LLM**: selector de proveedor (Groq, Google, Anthropic, OpenAI, Ollama, Personalizado) + input de API key (solo localStorage)
- [x] Ficha **Carpeta de Libros**: ruta actual, conteo de libros, botón cambiar/seleccionar
- [x] CTA en biblioteca vacía redirige a Configuración → Carpeta
- [x] Descarga cloud sin carpeta redirige a Configuración → Carpeta

---

## Fase 2: Storage de Usuario

Permitir que el usuario configure su propio almacenamiento para sincronizar libros directamente, sin pasar por el servidor KlioReader.

### Proveedores
- [x] **S3-compatible** — AWS S3, Backblaze B2, MinIO, Wasabi (signing AWS V4 manual)
- [x] **WebDAV** — Nextcloud, ownCloud, etc. (PROPFIND, PUT, GET, DELETE, MKCOL)
- [x] **Google Drive** — OAuth2 PKCE flow, servidor HTTP local temporal, auto-refresh tokens

### Sincronización
- [x] Motor de sync bidireccional (`src-tauri/src/storage/sync_engine.rs`)
- [x] Comparación por hash MD5 + timestamp
- [x] Archivo `.klio-sync.json` en storage remoto con metadata (progreso, notas, bookmarks)
- [x] Estado local persistido en `~/.config/klioreader/sync_state.json`
- [x] Auto-sync configurable (1, 5, 15, 30 min)
- [x] Detección de conflictos con notificación al usuario

### Frontend
- [x] Nueva ficha "Mi Storage" en Configuración (selector de proveedor, formularios dinámicos)
- [x] Botón "Probar Conexión"
- [x] Sync manual + toggle auto-sync con selector de intervalo
- [x] Indicador de sync en sidebar (syncing/synced/error/disabled)
- [x] Progreso de lectura sincronizado automáticamente al cambiar capítulo

### Arquitectura
- Trait `UserStorageProvider` en Rust con 7 operaciones (list, upload, download, delete, read_bytes, write_bytes, test_connection)
- Credenciales en localStorage (`klioUserStorage`), nunca pasan por servidor
- Todo el I/O de storage en Rust (evita CORS, acceso directo a filesystem, signing nativo)
- 11 comandos Tauri + eventos (sync-progress, sync-complete, sync-conflict)
- Deps: reqwest, hmac, sha2, chrono, tiny_http, tokio, md-5, async-trait, open

---

## Fase 3: Integración LLM

Usar la API key configurada en Fase 1 para funciones inteligentes:

### Funcionalidades
- **Resumen automático** de capítulos/libros
- **Chat con el libro** — preguntas sobre el contenido
- **Definiciones** — seleccionar texto para obtener definición/contexto
- **Traducciones** inline
- **Generación de flashcards** a partir del contenido

### Arquitectura
- Llamadas directas desde la app al proveedor LLM (la API key del usuario)
- Caché local de respuestas para evitar re-solicitar
- Soporte para Ollama (100% local, sin internet)
- Streaming de respuestas para chat interactivo

---

## Fase 4: Mejoras de Lectura

- Resaltado de texto persistente con colores
- Anotaciones en línea (vinculadas a posición exacta)
- Búsqueda dentro del libro
- Table of Contents interactivo
- Modo lectura nocturna con ajuste de brillo
- Text-to-Speech integrado

---

## Fase 5: Social y Comunidad

- Perfiles públicos opcionales
- Estanterías compartidas
- Reviews y puntuaciones
- Clubs de lectura
- Retos de lectura grupales
