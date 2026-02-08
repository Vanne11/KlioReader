# KlioReader API Documentation

## Base URL

```
https://your-domain.com/api/
```

All endpoints are relative to this base URL. The API returns JSON responses with `Content-Type: application/json; charset=utf-8`.

---

## Authentication

KlioReader uses **JWT (JSON Web Tokens)** with the HS256 algorithm.

### How it works

1. Register or log in to obtain a JWT token
2. Include the token in subsequent requests via the `Authorization` header
3. Tokens expire after **24 hours** by default (configurable via `JWT_EXPIRY` in `.env`)

### Required header for protected endpoints

```
Authorization: Bearer <your_jwt_token>
```

### Token payload

```json
{
  "user_id": 1,
  "iat": 1700000000,
  "exp": 1700086400
}
```

### Error response (401)

Returned when the token is missing, invalid, or expired:

```json
{
  "error": "Token invalido o expirado"
}
```

---

## CORS Configuration

- **Allowed Origins:** Configurable via `ALLOWED_ORIGINS` in `.env` (comma-separated), defaults to `*`
- **Allowed Methods:** `GET, POST, PUT, DELETE, OPTIONS`
- **Allowed Headers:** `Content-Type, Authorization`
- **Preflight Cache:** 24 hours

---

## Endpoints

### Health Check

#### `GET /`

Check API status. Public endpoint.

**Response (200):**

```json
{
  "status": "ok",
  "api": "KlioReader3"
}
```

---

### Auth

#### `POST /auth/register`

Register a new user account. Public endpoint.

**Request body:**

```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "secret123"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `username` | string | Yes | Min 3 characters, unique |
| `email` | string | Yes | Valid email format, unique |
| `password` | string | Yes | Min 6 characters |

**Response (201):**

```json
{
  "result": "ok",
  "token": "eyJhbGciOi...",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com"
  }
}
```

**Errors:**

| Code | Response |
|------|----------|
| 403 | Registration is disabled by admin |
| 409 | `{"error": "El usuario o email ya existe"}` |
| 422 | `{"error": "Username (min 3), email valido y password (min 6) requeridos"}` |

---

#### `POST /auth/login`

Authenticate and obtain a JWT token. Public endpoint.

**Request body:**

```json
{
  "login": "johndoe",
  "password": "secret123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `login` | string | Yes | Username or email |
| `password` | string | Yes | Account password |

**Response (200):**

```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com",
    "xp": 0,
    "level": 1,
    "streak": 0
  }
}
```

**Errors:**

| Code | Response |
|------|----------|
| 401 | `{"error": "Credenciales incorrectas"}` |
| 422 | `{"error": "Login y password requeridos"}` |

---

### User

All user endpoints require authentication.

#### `GET /user/profile`

Get the authenticated user's profile.

**Response (200):**

```json
{
  "id": 1,
  "username": "johndoe",
  "email": "john@example.com",
  "avatar": "base64_or_url_string",
  "xp": 1500,
  "level": 5,
  "streak": 7,
  "last_streak_date": "2024-12-01",
  "created_at": "2024-01-15 10:30:00",
  "total_books": 12,
  "total_notes": 45,
  "total_bookmarks": 23
}
```

---

#### `PUT /user/profile`

Update the authenticated user's profile.

**Request body (all fields optional):**

```json
{
  "username": "newname",
  "email": "newemail@example.com",
  "avatar": "base64_encoded_image",
  "password": "newpassword123"
}
```

**Response (200):**

```json
{
  "ok": true
}
```

**Errors:**

| Code | Response |
|------|----------|
| 409 | `{"error": "El username o email ya esta en uso"}` |
| 422 | `{"error": "No hay campos para actualizar"}` |

---

#### `GET /user/stats`

Get the user's gamification stats.

**Response (200):**

```json
{
  "xp": 1500,
  "level": 5,
  "streak": 7,
  "last_streak_date": "2024-12-01"
}
```

---

#### `PUT /user/stats`

Update the user's gamification stats.

**Request body:**

```json
{
  "xp": 1500,
  "level": 5,
  "streak": 7,
  "last_streak_date": "2024-12-01"
}
```

**Response (200):**

```json
{
  "ok": true
}
```

---

#### `DELETE /user/delete`

Permanently delete the user's account and all associated data (books, notes, bookmarks, reading progress, uploaded files).

**Response (200):**

```json
{
  "ok": true
}
```

> **Warning:** This action is irreversible. All user data will be permanently deleted.

---

### Books

All book endpoints require authentication.

#### `GET /books`

List all books belonging to the authenticated user, sorted by last read date (most recent first).

**Response (200):**

```json
[
  {
    "id": 1,
    "user_id": 1,
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "description": "A story about...",
    "file_name": "great-gatsby.epub",
    "file_path": "abc123.epub",
    "file_size": 1024000,
    "file_type": "epub",
    "cover_base64": "data:image/jpeg;base64,...",
    "total_chapters": 9,
    "storage_type": "local",
    "storage_file_id": null,
    "book_hash": "sha256_hash_string",
    "stored_file_id": 1,
    "created_at": "2024-01-15 10:30:00",
    "current_chapter": 3,
    "current_page": 45,
    "progress_percent": 33,
    "last_read": "2024-12-01 14:20:00"
  }
]
```

---

#### `GET /books/{id}`

Get details of a specific book.

**Response (200):** Same structure as a single item from `GET /books`.

**Errors:**

| Code | Response |
|------|----------|
| 404 | `{"error": "Libro no encontrado"}` |

---

#### `PUT /books/{id}`

Update book metadata.

**Request body (all fields optional):**

```json
{
  "title": "Updated Title",
  "author": "Updated Author",
  "description": "Updated description",
  "cover_base64": "data:image/jpeg;base64,...",
  "total_chapters": 15
}
```

**Response (200):**

```json
{
  "ok": true
}
```

**Errors:**

| Code | Response |
|------|----------|
| 422 | `{"error": "No hay campos para actualizar"}` |

---

#### `POST /books/check-hash`

Check if a file already exists in storage by its MD5 hash. Used for deduplication before uploading.

**Request body:**

```json
{
  "md5": "d41d8cd98f00b204e9800998ecf8427e"
}
```

**Response (200) - File exists:**

```json
{
  "exists": true,
  "file_size": 1024000,
  "file_type": "epub"
}
```

**Response (200) - File does not exist:**

```json
{
  "exists": false
}
```

---

#### `POST /books/upload`

Upload a new book. Supports both regular uploads and deduplicated uploads.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Conditional | EPUB or PDF file (max 50MB). Required unless doing a deduplicated upload. |
| `file_hash` | string | No | MD5 hash for deduplication. If provided without `file`, performs a deduplicated upload. |
| `title` | string | No | Book title. Auto-extracted from EPUB if not provided. |
| `author` | string | No | Book author. Auto-extracted from EPUB if not provided. |
| `description` | string | No | Book description. Auto-extracted from EPUB if not provided. |
| `cover_base64` | string | No | Cover image as base64 string. |
| `total_chapters` | integer | No | Total number of chapters. Defaults to 0. |

**Upload flow:**

1. **Regular upload:** Send the file. The server calculates MD5 and checks for duplicates automatically.
2. **Deduplicated upload:** First call `POST /books/check-hash` with the file's MD5. If it exists, send only `file_hash` + metadata (no file needed).
3. If a book with the same title+author was previously deleted, reading progress is automatically restored.

**Response (201):**

```json
{
  "id": 5,
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "file_name": "great-gatsby.epub",
  "file_type": "epub",
  "file_size": 1024000,
  "storage_type": "local",
  "deduplicated": false,
  "progress_restored": true,
  "restored_progress_percent": 45
}
```

**Errors:**

| Code | Response |
|------|----------|
| 413 | `{"error": "Cuota de almacenamiento excedida. Limite: 512 MB"}` |
| 422 | `{"error": "Solo se permiten archivos EPUB y PDF"}` |
| 422 | `{"error": "El archivo excede el tamano maximo (50MB)"}` |
| 422 | `{"error": "No se envio ningun archivo"}` |

---

#### `GET /books/{id}/download`

Download the book file. Returns the raw file binary with appropriate MIME type.

**Response headers:**

```
Content-Type: application/epub+zip  (or application/pdf)
Content-Disposition: attachment; filename="book-title.epub"
Content-Length: 1024000
```

**Response (200):** Raw file binary.

**Errors:**

| Code | Response |
|------|----------|
| 404 | `{"error": "Libro no encontrado"}` |
| 404 | `{"error": "Archivo no encontrado en el servidor"}` |

---

#### `DELETE /books/{id}`

Delete a book. Reading progress is archived and can be restored if the same book is uploaded again.

> **Note:** The physical file is never deleted from storage (it persists for deduplication). Only the book record and associated data (notes, bookmarks, progress) are removed.

**Response (200):**

```json
{
  "ok": true
}
```

**Errors:**

| Code | Response |
|------|----------|
| 404 | `{"error": "Libro no encontrado"}` |

---

### Reading Progress

All progress endpoints require authentication.

#### `GET /books/{id}/progress`

Get the current reading progress for a book.

**Response (200) - With progress:**

```json
{
  "user_id": 1,
  "book_id": 5,
  "current_chapter": 12,
  "current_page": 245,
  "progress_percent": 35,
  "last_read": "2024-12-01 10:30:00"
}
```

**Response (200) - No progress yet:**

```json
{
  "current_chapter": 0,
  "current_page": 0,
  "progress_percent": 0
}
```

---

#### `PUT /books/{id}/progress`

Update reading progress. Creates a new record if none exists. Automatically updates `last_read` timestamp.

**Request body (all fields optional):**

```json
{
  "current_chapter": 12,
  "current_page": 245,
  "progress_percent": 35
}
```

**Response (200):**

```json
{
  "ok": true
}
```

---

### Notes

All note endpoints require authentication.

#### `GET /books/{id}/notes`

Get all notes for a book, sorted by chapter index and creation date.

**Response (200):**

```json
[
  {
    "id": 1,
    "user_id": 1,
    "book_id": 5,
    "chapter_index": 3,
    "content": "This is an important passage about...",
    "highlight_text": "The original highlighted text",
    "color": "#ffeb3b",
    "created_at": "2024-12-01 10:30:00"
  }
]
```

---

#### `POST /books/{id}/notes`

Create a new note for a book.

**Request body:**

```json
{
  "chapter_index": 3,
  "content": "My note about this chapter",
  "highlight_text": "The text I highlighted",
  "color": "#ffeb3b"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chapter_index` | integer | Yes | Chapter number (0-indexed) |
| `content` | string | Yes | Note content |
| `highlight_text` | string | No | Original highlighted text |
| `color` | string | No | Hex color code. Defaults to `#ffeb3b` |

**Response (201):**

```json
{
  "id": 1
}
```

---

#### `DELETE /notes/{id}`

Delete a note by its ID.

**Response (200):**

```json
{
  "ok": true
}
```

---

### Bookmarks

All bookmark endpoints require authentication.

#### `GET /books/{id}/bookmarks`

Get all bookmarks for a book, sorted by chapter and page index.

**Response (200):**

```json
[
  {
    "id": 1,
    "user_id": 1,
    "book_id": 5,
    "chapter_index": 5,
    "page_index": 127,
    "label": "Important section",
    "created_at": "2024-12-01 10:30:00"
  }
]
```

---

#### `POST /books/{id}/bookmarks`

Create a new bookmark.

**Request body:**

```json
{
  "chapter_index": 5,
  "page_index": 127,
  "label": "Important section"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chapter_index` | integer | Yes | Chapter number (0-indexed) |
| `page_index` | integer | Yes | Page number |
| `label` | string | No | Descriptive label for the bookmark |

**Response (201):**

```json
{
  "id": 1
}
```

---

#### `DELETE /bookmarks/{id}`

Delete a bookmark by its ID.

**Response (200):**

```json
{
  "ok": true
}
```

---

## Quick Reference

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/auth/register` | Register new account |
| POST | `/auth/login` | Login and get token |

### Protected Endpoints (require `Authorization: Bearer <token>`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/user/profile` | Get user profile |
| PUT | `/user/profile` | Update user profile |
| GET | `/user/stats` | Get user stats (XP, level, streak) |
| PUT | `/user/stats` | Update user stats |
| DELETE | `/user/delete` | Delete user account |
| GET | `/books` | List user's books |
| GET | `/books/{id}` | Get book details |
| PUT | `/books/{id}` | Update book metadata |
| POST | `/books/check-hash` | Check file hash for deduplication |
| POST | `/books/upload` | Upload a new book |
| GET | `/books/{id}/download` | Download book file |
| DELETE | `/books/{id}` | Delete a book |
| GET | `/books/{id}/progress` | Get reading progress |
| PUT | `/books/{id}/progress` | Update reading progress |
| GET | `/books/{id}/notes` | Get book notes |
| POST | `/books/{id}/notes` | Create a note |
| DELETE | `/notes/{id}` | Delete a note |
| GET | `/books/{id}/bookmarks` | Get book bookmarks |
| POST | `/books/{id}/bookmarks` | Create a bookmark |
| DELETE | `/bookmarks/{id}` | Delete a bookmark |

---

## Connection Examples

### JavaScript / React Native (Fetch)

```javascript
const API_BASE = 'https://your-domain.com/api';
let token = null;

// Login
async function login(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: username, password }),
  });
  const data = await res.json();
  token = data.token;
  return data;
}

// Authenticated request helper
async function apiRequest(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
  return res.json();
}

// Get all books
const books = await apiRequest('/books');

// Upload a book (with deduplication)
async function uploadBook(file) {
  // 1. Calculate MD5 and check if file exists
  const md5 = await calculateMD5(file);
  const check = await apiRequest('/books/check-hash', {
    method: 'POST',
    body: JSON.stringify({ md5 }),
  });

  const formData = new FormData();
  if (check.exists) {
    // Deduplicated upload - no file needed
    formData.append('file_hash', md5);
    formData.append('title', 'Book Title');
    formData.append('author', 'Author Name');
  } else {
    // Regular upload
    formData.append('file', file);
  }

  const res = await fetch(`${API_BASE}/books/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  return res.json();
}

// Update reading progress
await apiRequest('/books/1/progress', {
  method: 'PUT',
  body: JSON.stringify({
    current_chapter: 5,
    current_page: 120,
    progress_percent: 33,
  }),
});

// Download a book
async function downloadBook(bookId) {
  const res = await fetch(`${API_BASE}/books/${bookId}/download`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return res.blob();
}
```

### cURL

```bash
# Login
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login": "johndoe", "password": "secret123"}'

# Get books (replace TOKEN with your JWT)
curl https://your-domain.com/api/books \
  -H "Authorization: Bearer TOKEN"

# Upload a book
curl -X POST https://your-domain.com/api/books/upload \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@/path/to/book.epub"

# Update progress
curl -X PUT https://your-domain.com/api/books/1/progress \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"current_chapter": 5, "progress_percent": 33}'
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created (new resource) |
| 204 | No Content (CORS preflight) |
| 401 | Unauthorized (invalid/expired token) |
| 403 | Forbidden (e.g., registration disabled) |
| 404 | Not Found |
| 409 | Conflict (duplicate username/email) |
| 413 | Payload Too Large (storage quota exceeded) |
| 422 | Unprocessable Entity (validation error) |
