<?php

class BookController
{
    private function uploadsDir()
    {
        $dir = dirname(__DIR__, 2) . '/uploads';
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        return $dir;
    }

    private function extractEpubMetadata($filePath)
    {
        $meta = array();
        try {
            $zip = new ZipArchive();
            if ($zip->open($filePath) !== true) return $meta;

            // 1. Read container.xml to find OPF path
            $container = $zip->getFromName('META-INF/container.xml');
            if (!$container) { $zip->close(); return $meta; }

            $containerXml = new SimpleXMLElement($container);
            $containerXml->registerXPathNamespace('c', 'urn:oasis:names:tc:opendocument:xmlns:container');
            $rootfiles = $containerXml->xpath('//c:rootfile/@full-path');
            if (empty($rootfiles)) { $zip->close(); return $meta; }

            $opfPath = (string)$rootfiles[0];

            // 2. Read the OPF file
            $opfContent = $zip->getFromName($opfPath);
            $zip->close();
            if (!$opfContent) return $meta;

            $opf = new SimpleXMLElement($opfContent);
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
                $meta['description'] = strip_tags($desc);
            }
        } catch (Exception $e) {
            // Silently fail - metadata extraction is best-effort
        }
        return $meta;
    }

    // GET /api/books
    public function listBooks($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('
            SELECT b.*, rp.current_chapter, rp.current_page, rp.progress_percent, rp.last_read
            FROM books b
            LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = b.user_id
            WHERE b.user_id = ?
            ORDER BY COALESCE(rp.last_read, b.created_at) DESC
        ');
        $stmt->execute(array($params['user_id']));
        $books = $stmt->fetchAll();

        // Convert numeric fields
        foreach ($books as &$b) {
            $b['id'] = (int)$b['id'];
            $b['file_size'] = (int)$b['file_size'];
            $b['total_chapters'] = (int)$b['total_chapters'];
            $b['current_chapter'] = (int)(isset($b['current_chapter']) ? $b['current_chapter'] : 0);
            $b['current_page'] = (int)(isset($b['current_page']) ? $b['current_page'] : 0);
            $b['progress_percent'] = (int)(isset($b['progress_percent']) ? $b['progress_percent'] : 0);
        }

        echo json_encode($books);
    }

    // GET /api/books/{id}
    public function get($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('
            SELECT b.*, rp.current_chapter, rp.current_page, rp.progress_percent, rp.last_read
            FROM books b
            LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = b.user_id
            WHERE b.id = ? AND b.user_id = ?
        ');
        $stmt->execute(array($params['id'], $params['user_id']));
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(404);
            echo json_encode(array('error' => 'Libro no encontrado'));
            return;
        }

        echo json_encode($book);
    }

    // PUT /api/books/{id}
    public function update($params)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $db = Database::get();

        $fields = array();
        $values = array();
        $allowed = array('title', 'author', 'description', 'cover_base64', 'total_chapters');

        foreach ($allowed as $key) {
            if (array_key_exists($key, $data)) {
                $fields[] = $key . ' = ?';
                $values[] = $data[$key];
            }
        }

        if (empty($fields)) {
            http_response_code(422);
            echo json_encode(array('error' => 'No hay campos para actualizar'));
            return;
        }

        $values[] = $params['id'];
        $values[] = $params['user_id'];
        $sql = 'UPDATE books SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?';
        $db->prepare($sql)->execute($values);

        echo json_encode(array('ok' => true));
    }

    // POST /api/books/upload
    public function upload($params)
    {
        if (!isset($_FILES['file'])) {
            http_response_code(422);
            echo json_encode(array('error' => 'No se envio ningun archivo'));
            return;
        }

        $file = $_FILES['file'];
        $maxSize = (int)(isset($_ENV['UPLOAD_MAX_SIZE']) ? $_ENV['UPLOAD_MAX_SIZE'] : 52428800);

        if ($file['error'] !== UPLOAD_ERR_OK) {
            http_response_code(422);
            echo json_encode(array('error' => 'Error al subir archivo: ' . $file['error']));
            return;
        }

        if ($file['size'] > $maxSize) {
            http_response_code(422);
            echo json_encode(array('error' => 'El archivo excede el tamano maximo (50MB)'));
            return;
        }

        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, array('epub', 'pdf'))) {
            http_response_code(422);
            echo json_encode(array('error' => 'Solo se permiten archivos EPUB y PDF'));
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
        $epubMeta = array();
        if ($ext === 'epub') {
            $epubMeta = $this->extractEpubMetadata($filePath);
        }

        // POST fields override auto-extracted (only if non-empty), fallback to filename
        $title = (!empty($_POST['title']) ? $_POST['title'] : null);
        if ($title === null) $title = isset($epubMeta['title']) ? $epubMeta['title'] : pathinfo($file['name'], PATHINFO_FILENAME);
        $author = (!empty($_POST['author']) ? $_POST['author'] : null);
        if ($author === null) $author = isset($epubMeta['author']) ? $epubMeta['author'] : '';
        $description = (!empty($_POST['description']) ? $_POST['description'] : null);
        if ($description === null) $description = isset($epubMeta['description']) ? $epubMeta['description'] : null;
        $totalChapters = (int)(isset($_POST['total_chapters']) ? $_POST['total_chapters'] : 0);
        $cover = isset($_POST['cover_base64']) ? $_POST['cover_base64'] : null;

        $db = Database::get();
        $stmt = $db->prepare('
            INSERT INTO books (user_id, title, author, description, file_name, file_path, file_size, file_type, cover_base64, total_chapters)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute(array(
            $userId, $title, $author, $description, $file['name'],
            $safeName, $file['size'], $ext, $cover, $totalChapters
        ));

        $bookId = (int)$db->lastInsertId();

        http_response_code(201);
        echo json_encode(array(
            'id' => $bookId,
            'title' => $title,
            'author' => $author,
            'file_name' => $file['name'],
            'file_type' => $ext,
            'file_size' => $file['size'],
        ));
    }

    // GET /api/books/{id}/download
    public function download($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT file_path, file_name, file_type FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute(array($params['id'], $params['user_id']));
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(404);
            echo json_encode(array('error' => 'Libro no encontrado'));
            return;
        }

        $fullPath = $this->uploadsDir() . '/' . $params['user_id'] . '/' . $book['file_path'];
        if (!file_exists($fullPath)) {
            http_response_code(404);
            echo json_encode(array('error' => 'Archivo no encontrado en el servidor'));
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
    public function deleteBook($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT file_path FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute(array($params['id'], $params['user_id']));
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(404);
            echo json_encode(array('error' => 'Libro no encontrado'));
            return;
        }

        // Delete file from disk
        $fullPath = $this->uploadsDir() . '/' . $params['user_id'] . '/' . $book['file_path'];
        if (file_exists($fullPath)) unlink($fullPath);

        // Delete from DB (cascade deletes progress, notes, bookmarks)
        $stmt = $db->prepare('DELETE FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute(array($params['id'], $params['user_id']));

        echo json_encode(array('ok' => true));
    }

    // GET /api/books/{id}/progress
    public function getProgress($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT * FROM reading_progress WHERE book_id = ? AND user_id = ?');
        $stmt->execute(array($params['id'], $params['user_id']));
        $progress = $stmt->fetch();

        echo json_encode($progress ? $progress : array('current_chapter' => 0, 'current_page' => 0, 'progress_percent' => 0));
    }

    // PUT /api/books/{id}/progress
    public function updateProgress($params)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $db = Database::get();

        $userId = $params['user_id'];
        $bookId = $params['id'];
        $chapter = (int)(isset($data['current_chapter']) ? $data['current_chapter'] : 0);
        $page = (int)(isset($data['current_page']) ? $data['current_page'] : 0);
        $percent = (int)(isset($data['progress_percent']) ? $data['progress_percent'] : 0);

        // INSERT OR IGNORE + UPDATE (compatible con todas las versiones de SQLite)
        $stmt = $db->prepare('INSERT OR IGNORE INTO reading_progress (user_id, book_id, current_chapter, current_page, progress_percent) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute(array($userId, $bookId, $chapter, $page, $percent));

        $stmt = $db->prepare('UPDATE reading_progress SET current_chapter = ?, current_page = ?, progress_percent = ?, last_read = datetime(\'now\') WHERE user_id = ? AND book_id = ?');
        $stmt->execute(array($chapter, $page, $percent, $userId, $bookId));

        echo json_encode(array('ok' => true));
    }

    // GET /api/books/{id}/notes
    public function getNotes($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT * FROM notes WHERE book_id = ? AND user_id = ? ORDER BY chapter_index, created_at');
        $stmt->execute(array($params['id'], $params['user_id']));
        echo json_encode($stmt->fetchAll());
    }

    // POST /api/books/{id}/notes
    public function addNote($params)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $db = Database::get();

        $stmt = $db->prepare('
            INSERT INTO notes (user_id, book_id, chapter_index, content, highlight_text, color)
            VALUES (?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute(array(
            $params['user_id'],
            $params['id'],
            (int)(isset($data['chapter_index']) ? $data['chapter_index'] : 0),
            isset($data['content']) ? $data['content'] : '',
            isset($data['highlight_text']) ? $data['highlight_text'] : null,
            isset($data['color']) ? $data['color'] : '#ffeb3b',
        ));

        http_response_code(201);
        echo json_encode(array('id' => (int)$db->lastInsertId()));
    }

    // DELETE /api/notes/{id}
    public function deleteNote($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('DELETE FROM notes WHERE id = ? AND user_id = ?');
        $stmt->execute(array($params['id'], $params['user_id']));
        echo json_encode(array('ok' => true));
    }

    // GET /api/books/{id}/bookmarks
    public function getBookmarks($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT * FROM bookmarks WHERE book_id = ? AND user_id = ? ORDER BY chapter_index, page_index');
        $stmt->execute(array($params['id'], $params['user_id']));
        echo json_encode($stmt->fetchAll());
    }

    // POST /api/books/{id}/bookmarks
    public function addBookmark($params)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $db = Database::get();

        $stmt = $db->prepare('
            INSERT INTO bookmarks (user_id, book_id, chapter_index, page_index, label)
            VALUES (?, ?, ?, ?, ?)
        ');
        $stmt->execute(array(
            $params['user_id'],
            $params['id'],
            (int)(isset($data['chapter_index']) ? $data['chapter_index'] : 0),
            (int)(isset($data['page_index']) ? $data['page_index'] : 0),
            isset($data['label']) ? $data['label'] : '',
        ));

        http_response_code(201);
        echo json_encode(array('id' => (int)$db->lastInsertId()));
    }

    // DELETE /api/bookmarks/{id}
    public function deleteBookmark($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?');
        $stmt->execute(array($params['id'], $params['user_id']));
        echo json_encode(array('ok' => true));
    }
}
