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

    // POST /api/books/check-hash
    public function checkHash($params)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $md5 = isset($data['md5']) ? trim($data['md5']) : '';

        if (empty($md5)) {
            http_response_code(422);
            echo json_encode(array('error' => 'Se requiere el campo md5'));
            return;
        }

        $db = Database::get();
        $stmt = $db->prepare('SELECT file_size, file_type FROM stored_files WHERE file_hash = ?');
        $stmt->execute(array($md5));
        $stored = $stmt->fetch();

        if ($stored) {
            echo json_encode(array(
                'exists' => true,
                'file_size' => (int)$stored['file_size'],
                'file_type' => $stored['file_type'],
            ));
        } else {
            echo json_encode(array('exists' => false));
        }
    }

    // POST /api/books/upload
    public function upload($params)
    {
        $userId = $params['user_id'];
        $db = Database::get();
        $fileHash = isset($_POST['file_hash']) ? trim($_POST['file_hash']) : '';

        // Verificar si es una subida deduplicada (solo hash, sin archivo)
        if (!empty($fileHash) && !isset($_FILES['file'])) {
            $this->uploadDeduplicated($params, $fileHash);
            return;
        }

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

        // Verificar cuota de almacenamiento
        $stmt = $db->prepare('SELECT storage_used, upload_limit FROM users WHERE id = ?');
        $stmt->execute(array($userId));
        $quota = $stmt->fetch();

        if ($quota && (int)$quota['upload_limit'] > 0) {
            if ((int)$quota['storage_used'] + $file['size'] > (int)$quota['upload_limit']) {
                http_response_code(413);
                echo json_encode(array('error' => 'Cuota de almacenamiento excedida. Limite: ' . round((int)$quota['upload_limit'] / 1048576) . ' MB'));
                return;
            }
        }

        // Guardar localmente primero (temporal para extraer metadata)
        $userDir = $this->uploadsDir() . '/' . $userId;
        if (!is_dir($userDir)) mkdir($userDir, 0755, true);

        $safeName = time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $file['name']);
        $localPath = $userDir . '/' . $safeName;
        move_uploaded_file($file['tmp_name'], $localPath);

        // Calcular MD5 del archivo
        $fileMd5 = md5_file($localPath);

        // Si el cliente envió file_hash, verificar que coincide
        if (!empty($fileHash) && $fileHash !== $fileMd5) {
            @unlink($localPath);
            http_response_code(422);
            echo json_encode(array('error' => 'El hash del archivo no coincide con el proporcionado'));
            return;
        }

        // Auto-extract metadata from EPUB
        $epubMeta = array();
        if ($ext === 'epub') {
            $epubMeta = $this->extractEpubMetadata($localPath);
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

        // Computar hash del libro para detección de progreso
        $bookHash = StorageManager::computeBookHash($title, $author);

        // Verificar progreso archivado (detección de libro re-subido)
        $archivedProgress = null;
        $stmt = $db->prepare('SELECT * FROM progress_archive WHERE user_id = ? AND book_hash = ?');
        $stmt->execute(array($userId, $bookHash));
        $archivedProgress = $stmt->fetch();

        // Verificar si el archivo ya existe en stored_files (dedup por MD5)
        $storedFileId = null;
        $storageType = 'local';
        $storageFileId = null;
        $storagePath = $userId . '/' . $safeName;

        $stmt = $db->prepare('SELECT * FROM stored_files WHERE file_hash = ?');
        $stmt->execute(array($fileMd5));
        $existingFile = $stmt->fetch();

        if ($existingFile) {
            // Archivo ya existe, no necesitamos subirlo de nuevo
            $storedFileId = (int)$existingFile['id'];
            $storageType = $existingFile['storage_type'];
            $storageFileId = $existingFile['storage_file_id'];
            $storagePath = $existingFile['storage_path'];
            // Borrar la copia local que acabamos de guardar
            @unlink($localPath);
            @rmdir($userDir); // Eliminar directorio si quedó vacío
        } else {
            // Archivo nuevo: subir al proveedor de almacenamiento activo
            $sm = StorageManager::getInstance();
            $driver = $sm->getDriver();
            $activeProvider = $sm->getActiveProvider();
            $contentType = $ext === 'pdf' ? 'application/pdf' : 'application/epub+zip';

            if ($activeProvider === 'local') {
                $storageType = 'local';
            } else {
                $result = $driver->upload($localPath, $storagePath, $contentType);
                if ($result) {
                    $storageType = $activeProvider;
                    $storageFileId = $result['file_id'];
                    @unlink($localPath);
                } else {
                    $storageType = 'local';
                }
            }

            // Crear registro en stored_files
            $stmt = $db->prepare('INSERT INTO stored_files (file_hash, file_size, file_type, storage_type, storage_file_id, storage_path) VALUES (?, ?, ?, ?, ?, ?)');
            $stmt->execute(array($fileMd5, $file['size'], $ext, $storageType, $storageFileId, $storagePath));
            $storedFileId = (int)$db->lastInsertId();
        }

        // Crear registro en books
        $stmt = $db->prepare('
            INSERT INTO books (user_id, title, author, description, file_name, file_path, file_size, file_type, cover_base64, total_chapters, storage_type, storage_file_id, book_hash, stored_file_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute(array(
            $userId, $title, $author, $description, $file['name'],
            $storagePath, $file['size'], $ext, $cover, $totalChapters,
            $storageType, $storageFileId, $bookHash, $storedFileId
        ));

        $bookId = (int)$db->lastInsertId();

        // Restaurar progreso archivado si existe
        if ($archivedProgress) {
            $stmt = $db->prepare('INSERT OR IGNORE INTO reading_progress (user_id, book_id, current_chapter, current_page, progress_percent, last_read) VALUES (?, ?, ?, ?, ?, ?)');
            $stmt->execute(array(
                $userId,
                $bookId,
                (int)$archivedProgress['current_chapter'],
                (int)$archivedProgress['current_page'],
                (int)$archivedProgress['progress_percent'],
                $archivedProgress['last_read']
            ));
            $db->prepare('DELETE FROM progress_archive WHERE id = ?')
                ->execute(array($archivedProgress['id']));
        }

        // Actualizar storage_used
        $db->prepare('UPDATE users SET storage_used = storage_used + ? WHERE id = ?')
            ->execute(array($file['size'], $userId));

        http_response_code(201);
        $response = array(
            'id' => $bookId,
            'title' => $title,
            'author' => $author,
            'file_name' => $file['name'],
            'file_type' => $ext,
            'file_size' => $file['size'],
            'storage_type' => $storageType,
            'deduplicated' => ($existingFile ? true : false),
        );
        if ($archivedProgress) {
            $response['progress_restored'] = true;
            $response['restored_progress_percent'] = (int)$archivedProgress['progress_percent'];
        }
        echo json_encode($response);
    }

    // Subida deduplicada (sin archivo, solo hash + metadata)
    private function uploadDeduplicated($params, $fileHash)
    {
        $userId = $params['user_id'];
        $db = Database::get();

        // Buscar archivo existente por hash
        $stmt = $db->prepare('SELECT * FROM stored_files WHERE file_hash = ?');
        $stmt->execute(array($fileHash));
        $stored = $stmt->fetch();

        if (!$stored) {
            http_response_code(404);
            echo json_encode(array('error' => 'No se encontro un archivo con ese hash. Debe subir el archivo.'));
            return;
        }

        $fileSize = (int)$stored['file_size'];
        $fileType = $stored['file_type'];

        // Verificar cuota
        $stmt = $db->prepare('SELECT storage_used, upload_limit FROM users WHERE id = ?');
        $stmt->execute(array($userId));
        $quota = $stmt->fetch();

        if ($quota && (int)$quota['upload_limit'] > 0) {
            if ((int)$quota['storage_used'] + $fileSize > (int)$quota['upload_limit']) {
                http_response_code(413);
                echo json_encode(array('error' => 'Cuota de almacenamiento excedida. Limite: ' . round((int)$quota['upload_limit'] / 1048576) . ' MB'));
                return;
            }
        }

        $title = isset($_POST['title']) ? trim($_POST['title']) : 'Sin titulo';
        $author = isset($_POST['author']) ? trim($_POST['author']) : '';
        $description = isset($_POST['description']) ? trim($_POST['description']) : null;
        $totalChapters = (int)(isset($_POST['total_chapters']) ? $_POST['total_chapters'] : 0);
        $cover = isset($_POST['cover_base64']) ? $_POST['cover_base64'] : null;
        $fileName = isset($_POST['file_name']) ? $_POST['file_name'] : ('libro.' . $fileType);

        // Computar book_hash para detección de progreso
        $bookHash = StorageManager::computeBookHash($title, $author);

        // Verificar progreso archivado
        $archivedProgress = null;
        $stmt = $db->prepare('SELECT * FROM progress_archive WHERE user_id = ? AND book_hash = ?');
        $stmt->execute(array($userId, $bookHash));
        $archivedProgress = $stmt->fetch();

        // Crear registro en books apuntando al stored_file existente
        $stmt = $db->prepare('
            INSERT INTO books (user_id, title, author, description, file_name, file_path, file_size, file_type, cover_base64, total_chapters, storage_type, storage_file_id, book_hash, stored_file_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute(array(
            $userId, $title, $author, $description, $fileName,
            $stored['storage_path'], $fileSize, $fileType, $cover, $totalChapters,
            $stored['storage_type'], $stored['storage_file_id'], $bookHash, (int)$stored['id']
        ));

        $bookId = (int)$db->lastInsertId();

        // Restaurar progreso archivado si existe
        if ($archivedProgress) {
            $stmt = $db->prepare('INSERT OR IGNORE INTO reading_progress (user_id, book_id, current_chapter, current_page, progress_percent, last_read) VALUES (?, ?, ?, ?, ?, ?)');
            $stmt->execute(array(
                $userId,
                $bookId,
                (int)$archivedProgress['current_chapter'],
                (int)$archivedProgress['current_page'],
                (int)$archivedProgress['progress_percent'],
                $archivedProgress['last_read']
            ));
            $db->prepare('DELETE FROM progress_archive WHERE id = ?')
                ->execute(array($archivedProgress['id']));
        }

        // Incrementar storage_used (cuota aplica igual)
        $db->prepare('UPDATE users SET storage_used = storage_used + ? WHERE id = ?')
            ->execute(array($fileSize, $userId));

        http_response_code(201);
        $response = array(
            'id' => $bookId,
            'title' => $title,
            'author' => $author,
            'file_name' => $fileName,
            'file_type' => $fileType,
            'file_size' => $fileSize,
            'storage_type' => $stored['storage_type'],
            'deduplicated' => true,
        );
        if ($archivedProgress) {
            $response['progress_restored'] = true;
            $response['restored_progress_percent'] = (int)$archivedProgress['progress_percent'];
        }
        echo json_encode($response);
    }

    // GET /api/books/{id}/download
    public function download($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('
            SELECT b.file_name, b.file_type, b.stored_file_id,
                   b.file_path AS b_file_path, b.storage_type AS b_storage_type, b.storage_file_id AS b_storage_file_id,
                   sf.storage_path AS sf_storage_path, sf.storage_type AS sf_storage_type, sf.storage_file_id AS sf_storage_file_id
            FROM books b
            LEFT JOIN stored_files sf ON sf.id = b.stored_file_id
            WHERE b.id = ? AND b.user_id = ?
        ');
        $stmt->execute(array($params['id'], $params['user_id']));
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(404);
            echo json_encode(array('error' => 'Libro no encontrado'));
            return;
        }

        $mime = $book['file_type'] === 'pdf' ? 'application/pdf' : 'application/epub+zip';

        // Priorizar stored_files si existe, fallback a campos legacy de books
        if (!empty($book['stored_file_id']) && !empty($book['sf_storage_path'])) {
            $storagePath = $book['sf_storage_path'];
            $storageType = $book['sf_storage_type'];
            $storageFileId = $book['sf_storage_file_id'];
        } else {
            $storagePath = $params['user_id'] . '/' . $book['b_file_path'];
            $storageType = isset($book['b_storage_type']) ? $book['b_storage_type'] : 'local';
            $storageFileId = $book['b_storage_file_id'];
        }

        if ($storageType === 'local') {
            $fullPath = $this->uploadsDir() . '/' . $storagePath;
            if (!file_exists($fullPath)) {
                http_response_code(404);
                echo json_encode(array('error' => 'Archivo no encontrado en el servidor'));
                return;
            }
            header('Content-Type: ' . $mime);
            header('Content-Disposition: attachment; filename="' . $book['file_name'] . '"');
            header('Content-Length: ' . filesize($fullPath));
            readfile($fullPath);
            exit;
        }

        // Descargar desde proveedor remoto (proxy)
        $sm = StorageManager::getInstance();
        $driver = $sm->getDriver($storageType);
        header('Content-Type: ' . $mime);
        header('Content-Disposition: attachment; filename="' . $book['file_name'] . '"');
        $driver->download($storagePath, $storageFileId);
        exit;
    }

    // DELETE /api/books/{id}
    public function deleteBook($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT id, file_path, file_size, storage_type, storage_file_id, book_hash, stored_file_id FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute(array($params['id'], $params['user_id']));
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(404);
            echo json_encode(array('error' => 'Libro no encontrado'));
            return;
        }

        $fileSize = (int)$book['file_size'];

        // Archivar progreso antes de eliminar
        if (!empty($book['book_hash'])) {
            $stmt = $db->prepare('SELECT current_chapter, current_page, progress_percent, last_read FROM reading_progress WHERE book_id = ? AND user_id = ?');
            $stmt->execute(array($book['id'], $params['user_id']));
            $progress = $stmt->fetch();
            if ($progress && (int)$progress['progress_percent'] > 0) {
                $stmt = $db->prepare('INSERT OR REPLACE INTO progress_archive (user_id, book_hash, current_chapter, current_page, progress_percent, last_read) VALUES (?, ?, ?, ?, ?, ?)');
                $stmt->execute(array(
                    $params['user_id'],
                    $book['book_hash'],
                    (int)$progress['current_chapter'],
                    (int)$progress['current_page'],
                    (int)$progress['progress_percent'],
                    $progress['last_read']
                ));
            }
        }

        // NUNCA se borra el archivo físico ni el registro de stored_files.
        // Solo se elimina la referencia del usuario (registro en books).

        // Delete from DB (cascade deletes progress, notes, bookmarks)
        $stmt = $db->prepare('DELETE FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute(array($params['id'], $params['user_id']));

        // Descontar storage_used
        $db->prepare('UPDATE users SET storage_used = MAX(0, storage_used - ?) WHERE id = ?')
            ->execute(array($fileSize, $params['user_id']));

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
