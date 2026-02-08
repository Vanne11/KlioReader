<?php
namespace KlioReader\Controllers;

use KlioReader\Config\Database;

class BookController
{
    private function uploadsDir(): string
    {
        $dir = dirname(__DIR__, 2) . '/uploads';
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        return $dir;
    }

    /**
     * Extract title, author, description from an EPUB file (ZIP with OPF XML)
     */
    private function extractEpubMetadata(string $filePath): array
    {
        $meta = [];
        try {
            $zip = new \ZipArchive();
            if ($zip->open($filePath) !== true) return $meta;

            // 1. Read container.xml to find OPF path
            $container = $zip->getFromName('META-INF/container.xml');
            if (!$container) { $zip->close(); return $meta; }

            $containerXml = new \SimpleXMLElement($container);
            $containerXml->registerXPathNamespace('c', 'urn:oasis:names:tc:opendocument:xmlns:container');
            $rootfiles = $containerXml->xpath('//c:rootfile/@full-path');
            if (empty($rootfiles)) { $zip->close(); return $meta; }

            $opfPath = (string)$rootfiles[0];

            // 2. Read the OPF file
            $opfContent = $zip->getFromName($opfPath);
            $zip->close();
            if (!$opfContent) return $meta;

            $opf = new \SimpleXMLElement($opfContent);
            $opf->registerXPathNamespace('dc', 'http://purl.org/dc/elements/1.1/');
            $opf->registerXPathNamespace('opf', 'http://www.idpf.org/2007/opf');

            // 3. Extract Dublin Core metadata
            $titles = $opf->xpath('//dc:title');
            if (!empty($titles)) $meta['title'] = trim((string)$titles[0]);

            $creators = $opf->xpath('//dc:creator');
            if (!empty($creators)) $meta['author'] = trim((string)$creators[0]);

            $descriptions = $opf->xpath('//dc:description');
            if (!empty($descriptions)) {
                $desc = trim((string)$descriptions[0]);
                // Strip HTML tags from description
                $meta['description'] = strip_tags($desc);
            }
        } catch (\Throwable $e) {
            // Silently fail - metadata extraction is best-effort
        }
        return $meta;
    }

    // GET /api/books
    public function list(array $params): void
    {
        $db = Database::get();
        $stmt = $db->prepare('
            SELECT b.*, rp.current_chapter, rp.current_page, rp.progress_percent, rp.last_read
            FROM books b
            LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = b.user_id
            WHERE b.user_id = ?
            ORDER BY COALESCE(rp.last_read, b.created_at) DESC
        ');
        $stmt->execute([$params['user_id']]);
        $books = $stmt->fetchAll();

        // Convert numeric fields
        foreach ($books as &$b) {
            $b['id'] = (int)$b['id'];
            $b['file_size'] = (int)$b['file_size'];
            $b['total_chapters'] = (int)$b['total_chapters'];
            $b['current_chapter'] = (int)($b['current_chapter'] ?? 0);
            $b['current_page'] = (int)($b['current_page'] ?? 0);
            $b['progress_percent'] = (int)($b['progress_percent'] ?? 0);
        }

        echo json_encode($books);
    }

    // GET /api/books/{id}
    public function get(array $params): void
    {
        $db = Database::get();
        $stmt = $db->prepare('
            SELECT b.*, rp.current_chapter, rp.current_page, rp.progress_percent, rp.last_read
            FROM books b
            LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = b.user_id
            WHERE b.id = ? AND b.user_id = ?
        ');
        $stmt->execute([$params['id'], $params['user_id']]);
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(404);
            echo json_encode(['error' => 'Libro no encontrado']);
            return;
        }

        echo json_encode($book);
    }

    // PUT /api/books/{id}
    public function update(array $params): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $db = Database::get();

        $fields = [];
        $values = [];
        $allowed = ['title', 'author', 'description', 'cover_base64', 'total_chapters'];

        foreach ($allowed as $key) {
            if (array_key_exists($key, $data)) {
                $fields[] = "$key = ?";
                $values[] = $data[$key];
            }
        }

        if (empty($fields)) {
            http_response_code(422);
            echo json_encode(['error' => 'No hay campos para actualizar']);
            return;
        }

        $values[] = $params['id'];
        $values[] = $params['user_id'];
        $sql = 'UPDATE books SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?';
        $db->prepare($sql)->execute($values);

        echo json_encode(['ok' => true]);
    }

    // POST /api/books/upload
    public function upload(array $params): void
    {
        if (!isset($_FILES['file'])) {
            http_response_code(422);
            echo json_encode(['error' => 'No se envió ningún archivo']);
            return;
        }

        $file = $_FILES['file'];
        $maxSize = (int)($_ENV['UPLOAD_MAX_SIZE'] ?? 52428800);

        if ($file['error'] !== UPLOAD_ERR_OK) {
            http_response_code(422);
            echo json_encode(['error' => 'Error al subir archivo: ' . $file['error']]);
            return;
        }

        if ($file['size'] > $maxSize) {
            http_response_code(422);
            echo json_encode(['error' => 'El archivo excede el tamaño máximo (50MB)']);
            return;
        }

        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['epub', 'pdf'])) {
            http_response_code(422);
            echo json_encode(['error' => 'Solo se permiten archivos EPUB y PDF']);
            return;
        }

        // Save file
        $userId = $params['user_id'];
        $userDir = $this->uploadsDir() . '/' . $userId;
        if (!is_dir($userDir)) mkdir($userDir, 0755, true);

        $safeName = time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $file['name']);
        $filePath = $userDir . '/' . $safeName;
        move_uploaded_file($file['tmp_name'], $filePath);

        // Auto-extract metadata from EPUB
        $epubMeta = [];
        if ($ext === 'epub') {
            $epubMeta = $this->extractEpubMetadata($filePath);
        }

        // POST fields override auto-extracted (only if non-empty), fallback to filename
        $title = (!empty($_POST['title']) ? $_POST['title'] : null) ?? ($epubMeta['title'] ?? pathinfo($file['name'], PATHINFO_FILENAME));
        $author = (!empty($_POST['author']) ? $_POST['author'] : null) ?? ($epubMeta['author'] ?? '');
        $description = (!empty($_POST['description']) ? $_POST['description'] : null) ?? ($epubMeta['description'] ?? null);
        $totalChapters = (int)($_POST['total_chapters'] ?? 0);
        $cover = $_POST['cover_base64'] ?? null;

        $db = Database::get();
        $stmt = $db->prepare('
            INSERT INTO books (user_id, title, author, description, file_name, file_path, file_size, file_type, cover_base64, total_chapters)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute([
            $userId, $title, $author, $description, $file['name'],
            $safeName, $file['size'], $ext, $cover, $totalChapters
        ]);

        $bookId = (int)$db->lastInsertId();

        http_response_code(201);
        echo json_encode([
            'id' => $bookId,
            'title' => $title,
            'author' => $author,
            'file_name' => $file['name'],
            'file_type' => $ext,
            'file_size' => $file['size'],
        ]);
    }

    // GET /api/books/{id}/download
    public function download(array $params): void
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT file_path, file_name, file_type FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute([$params['id'], $params['user_id']]);
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(404);
            echo json_encode(['error' => 'Libro no encontrado']);
            return;
        }

        $fullPath = $this->uploadsDir() . '/' . $params['user_id'] . '/' . $book['file_path'];
        if (!file_exists($fullPath)) {
            http_response_code(404);
            echo json_encode(['error' => 'Archivo no encontrado en el servidor']);
            return;
        }

        $mime = $book['file_type'] === 'pdf' ? 'application/pdf' : 'application/epub+zip';
        header('Content-Type: ' . $mime);
        header('Content-Disposition: attachment; filename="' . $book['file_name'] . '"');
        header('Content-Length: ' . filesize($fullPath));
        readfile($fullPath);
        exit;
    }

    // DELETE /api/books/{id}
    public function delete(array $params): void
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT file_path FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute([$params['id'], $params['user_id']]);
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(404);
            echo json_encode(['error' => 'Libro no encontrado']);
            return;
        }

        // Delete file from disk
        $fullPath = $this->uploadsDir() . '/' . $params['user_id'] . '/' . $book['file_path'];
        if (file_exists($fullPath)) unlink($fullPath);

        // Delete from DB (cascade deletes progress, notes, bookmarks)
        $stmt = $db->prepare('DELETE FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute([$params['id'], $params['user_id']]);

        echo json_encode(['ok' => true]);
    }

    // GET /api/books/{id}/progress
    public function getProgress(array $params): void
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT * FROM reading_progress WHERE book_id = ? AND user_id = ?');
        $stmt->execute([$params['id'], $params['user_id']]);
        $progress = $stmt->fetch();

        echo json_encode($progress ?: ['current_chapter' => 0, 'current_page' => 0, 'progress_percent' => 0]);
    }

    // PUT /api/books/{id}/progress
    public function updateProgress(array $params): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $db = Database::get();

        $stmt = $db->prepare('
            INSERT INTO reading_progress (user_id, book_id, current_chapter, current_page, progress_percent)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                current_chapter = VALUES(current_chapter),
                current_page = VALUES(current_page),
                progress_percent = VALUES(progress_percent),
                last_read = CURRENT_TIMESTAMP
        ');
        $stmt->execute([
            $params['user_id'],
            $params['id'],
            (int)($data['current_chapter'] ?? 0),
            (int)($data['current_page'] ?? 0),
            (int)($data['progress_percent'] ?? 0),
        ]);

        echo json_encode(['ok' => true]);
    }

    // GET /api/books/{id}/notes
    public function getNotes(array $params): void
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT * FROM notes WHERE book_id = ? AND user_id = ? ORDER BY chapter_index, created_at');
        $stmt->execute([$params['id'], $params['user_id']]);
        echo json_encode($stmt->fetchAll());
    }

    // POST /api/books/{id}/notes
    public function addNote(array $params): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $db = Database::get();

        $stmt = $db->prepare('
            INSERT INTO notes (user_id, book_id, chapter_index, content, highlight_text, color)
            VALUES (?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute([
            $params['user_id'],
            $params['id'],
            (int)($data['chapter_index'] ?? 0),
            $data['content'] ?? '',
            $data['highlight_text'] ?? null,
            $data['color'] ?? '#ffeb3b',
        ]);

        http_response_code(201);
        echo json_encode(['id' => (int)$db->lastInsertId()]);
    }

    // DELETE /api/notes/{id}
    public function deleteNote(array $params): void
    {
        $db = Database::get();
        $stmt = $db->prepare('DELETE FROM notes WHERE id = ? AND user_id = ?');
        $stmt->execute([$params['id'], $params['user_id']]);
        echo json_encode(['ok' => true]);
    }

    // GET /api/books/{id}/bookmarks
    public function getBookmarks(array $params): void
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT * FROM bookmarks WHERE book_id = ? AND user_id = ? ORDER BY chapter_index, page_index');
        $stmt->execute([$params['id'], $params['user_id']]);
        echo json_encode($stmt->fetchAll());
    }

    // POST /api/books/{id}/bookmarks
    public function addBookmark(array $params): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $db = Database::get();

        $stmt = $db->prepare('
            INSERT INTO bookmarks (user_id, book_id, chapter_index, page_index, label)
            VALUES (?, ?, ?, ?, ?)
        ');
        $stmt->execute([
            $params['user_id'],
            $params['id'],
            (int)($data['chapter_index'] ?? 0),
            (int)($data['page_index'] ?? 0),
            $data['label'] ?? '',
        ]);

        http_response_code(201);
        echo json_encode(['id' => (int)$db->lastInsertId()]);
    }

    // DELETE /api/bookmarks/{id}
    public function deleteBookmark(array $params): void
    {
        $db = Database::get();
        $stmt = $db->prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?');
        $stmt->execute([$params['id'], $params['user_id']]);
        echo json_encode(['ok' => true]);
    }
}
