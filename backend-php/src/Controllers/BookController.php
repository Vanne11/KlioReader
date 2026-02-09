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
        $seenFileIds = array();
        foreach ($books as &$b) {
            $b['id'] = (int)$b['id'];
            $b['file_size'] = (int)$b['file_size'];
            $b['total_chapters'] = (int)$b['total_chapters'];
            $b['current_chapter'] = (int)(isset($b['current_chapter']) ? $b['current_chapter'] : 0);
            $b['current_page'] = (int)(isset($b['current_page']) ? $b['current_page'] : 0);
            $b['progress_percent'] = (int)(isset($b['progress_percent']) ? $b['progress_percent'] : 0);
            $b['stored_file_id'] = $b['stored_file_id'] !== null ? (int)$b['stored_file_id'] : null;
            if ($b['stored_file_id'] !== null) {
                $seenFileIds[$b['stored_file_id']][] = $b['id'];
            }
        }
        unset($b);

        // Mark duplicates
        $dupFileIds = array();
        foreach ($seenFileIds as $sfId => $bookIds) {
            if (count($bookIds) > 1) {
                $dupFileIds[$sfId] = true;
            }
        }
        foreach ($books as &$b) {
            $b['is_duplicate'] = ($b['stored_file_id'] !== null && isset($dupFileIds[$b['stored_file_id']]));
        }
        unset($b);

        // Add share_count for each book
        $userId = $params['user_id'];
        foreach ($books as &$b) {
            $b['share_count'] = 0;
            if ($b['stored_file_id'] !== null) {
                $stmt = $db->prepare('SELECT COUNT(*) FROM book_shares WHERE stored_file_id = ? AND status = ? AND (from_user_id = ? OR to_user_id = ?)');
                $stmt->execute(array($b['stored_file_id'], 'accepted', $userId, $userId));
                $b['share_count'] = (int)$stmt->fetchColumn();
            }
        }
        unset($b);

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
        if (!in_array($ext, array('epub', 'pdf', 'cbr', 'cbz'))) {
            http_response_code(422);
            echo json_encode(array('error' => 'Solo se permiten archivos EPUB, PDF, CBR y CBZ'));
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

        // Upload idempotente: si ya existe un libro con el mismo user_id + book_hash, retornarlo
        $stmt = $db->prepare('SELECT id, title, author, file_name, file_type, file_size, storage_type FROM books WHERE user_id = ? AND book_hash = ?');
        $stmt->execute(array($userId, $bookHash));
        $existingBook = $stmt->fetch();
        if ($existingBook) {
            @unlink($localPath);
            @rmdir($userDir);
            http_response_code(200);
            echo json_encode(array(
                'id' => (int)$existingBook['id'],
                'title' => $existingBook['title'],
                'author' => $existingBook['author'],
                'file_name' => $existingBook['file_name'],
                'file_type' => $existingBook['file_type'],
                'file_size' => (int)$existingBook['file_size'],
                'storage_type' => $existingBook['storage_type'],
                'deduplicated' => false,
                'already_existed' => true,
            ));
            return;
        }

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

        // Upload idempotente: si ya existe un libro con el mismo user_id + book_hash, retornarlo
        $stmt = $db->prepare('SELECT id, title, author, file_name, file_type, file_size, storage_type FROM books WHERE user_id = ? AND book_hash = ?');
        $stmt->execute(array($userId, $bookHash));
        $existingBook = $stmt->fetch();
        if ($existingBook) {
            http_response_code(200);
            echo json_encode(array(
                'id' => (int)$existingBook['id'],
                'title' => $existingBook['title'],
                'author' => $existingBook['author'],
                'file_name' => $existingBook['file_name'],
                'file_type' => $existingBook['file_type'],
                'file_size' => (int)$existingBook['file_size'],
                'storage_type' => $existingBook['storage_type'],
                'deduplicated' => true,
                'already_existed' => true,
            ));
            return;
        }

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

        $mimeTypes = array(
            'pdf' => 'application/pdf',
            'epub' => 'application/epub+zip',
            'cbr' => 'application/x-cbr',
            'cbz' => 'application/x-cbz',
        );
        $mime = isset($mimeTypes[$book['file_type']]) ? $mimeTypes[$book['file_type']] : 'application/octet-stream';

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

    // POST /api/books/remove-duplicates
    public function removeDuplicates($params)
    {
        $userId = $params['user_id'];
        $db = Database::get();

        // Encontrar grupos de libros duplicados (mismo book_hash, múltiples registros)
        $stmt = $db->prepare('
            SELECT book_hash, COUNT(*) as cnt
            FROM books
            WHERE user_id = ? AND book_hash IS NOT NULL AND book_hash != ?
            GROUP BY book_hash
            HAVING cnt > 1
        ');
        $stmt->execute(array($userId, ''));
        $groups = $stmt->fetchAll();

        $removed = 0;
        $totalSizeFreed = 0;
        $kept = array();

        foreach ($groups as $group) {
            $bookHash = $group['book_hash'];

            // Obtener todos los libros de este grupo con su progreso
            $stmt = $db->prepare('
                SELECT b.id, b.title, b.author, b.file_size, b.book_hash, b.stored_file_id,
                       COALESCE(rp.progress_percent, 0) as progress_percent,
                       rp.current_chapter, rp.current_page, rp.last_read
                FROM books b
                LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = b.user_id
                WHERE b.user_id = ? AND b.book_hash = ?
                ORDER BY COALESCE(rp.progress_percent, 0) DESC, rp.last_read DESC, b.id ASC
            ');
            $stmt->execute(array($userId, $bookHash));
            $dupes = $stmt->fetchAll();

            if (count($dupes) < 2) continue;

            // Conservar el primero (mayor progreso, desempate por last_read más reciente)
            $keeper = $dupes[0];
            $kept[] = array('id' => (int)$keeper['id'], 'title' => $keeper['title']);

            for ($i = 1; $i < count($dupes); $i++) {
                $dupe = $dupes[$i];

                // Archivar progreso si tiene alguno
                if ((int)$dupe['progress_percent'] > 0 && !empty($dupe['book_hash'])) {
                    $stmt = $db->prepare('INSERT OR IGNORE INTO progress_archive (user_id, book_hash, current_chapter, current_page, progress_percent, last_read) VALUES (?, ?, ?, ?, ?, ?)');
                    $stmt->execute(array(
                        $userId,
                        $dupe['book_hash'],
                        (int)$dupe['current_chapter'],
                        (int)$dupe['current_page'],
                        (int)$dupe['progress_percent'],
                        $dupe['last_read']
                    ));
                }

                // Eliminar el duplicado
                $db->prepare('DELETE FROM books WHERE id = ? AND user_id = ?')->execute(array($dupe['id'], $userId));
                $totalSizeFreed += (int)$dupe['file_size'];
                $removed++;
            }
        }

        // Ajustar storage_used
        if ($totalSizeFreed > 0) {
            $db->prepare('UPDATE users SET storage_used = MAX(0, storage_used - ?) WHERE id = ?')
                ->execute(array($totalSizeFreed, $userId));
        }

        echo json_encode(array(
            'ok' => true,
            'removed' => $removed,
            'kept' => $kept,
            'size_freed' => $totalSizeFreed,
        ));
    }

    // DELETE /api/bookmarks/{id}
    public function deleteBookmark($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?');
        $stmt->execute(array($params['id'], $params['user_id']));
        echo json_encode(array('ok' => true));
    }

    // PUT /api/notes/{id}/share — Toggle is_shared
    public function toggleNoteShared($params)
    {
        $noteId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        $stmt = $db->prepare('SELECT id, is_shared FROM notes WHERE id = ? AND user_id = ?');
        $stmt->execute(array($noteId, $userId));
        $note = $stmt->fetch();

        if (!$note) {
            http_response_code(404);
            echo json_encode(array('error' => 'Nota no encontrada'));
            return;
        }

        $newValue = (int)$note['is_shared'] === 1 ? 0 : 1;
        $db->prepare('UPDATE notes SET is_shared = ? WHERE id = ?')->execute(array($newValue, $noteId));

        // Actualizar social_stats si se compartió
        if ($newValue === 1) {
            $db->prepare('INSERT OR IGNORE INTO social_stats (user_id) VALUES (?)')->execute(array($userId));
            $db->prepare('UPDATE social_stats SET shared_notes_count = shared_notes_count + 1 WHERE user_id = ?')->execute(array($userId));
        } else {
            $db->prepare('UPDATE social_stats SET shared_notes_count = MAX(0, shared_notes_count - 1) WHERE user_id = ?')->execute(array($userId));
        }

        echo json_encode(array('ok' => true, 'is_shared' => $newValue));
    }

    // GET /api/books/{id}/shared-notes — Notas compartidas de todos los usuarios que comparten el libro
    public function getSharedNotes($params)
    {
        $bookId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Obtener stored_file_id del libro
        $stmt = $db->prepare('SELECT stored_file_id FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute(array($bookId, $userId));
        $book = $stmt->fetch();

        if (!$book || empty($book['stored_file_id'])) {
            echo json_encode(array());
            return;
        }

        $storedFileId = (int)$book['stored_file_id'];

        // Buscar usuarios con relación aceptada via book_shares
        $stmt = $db->prepare('
            SELECT from_user_id, to_user_id FROM book_shares
            WHERE stored_file_id = ? AND status = ? AND (from_user_id = ? OR to_user_id = ?)
        ');
        $stmt->execute(array($storedFileId, 'accepted', $userId, $userId));
        $relations = $stmt->fetchAll();

        $connectedIds = array();
        foreach ($relations as $rel) {
            $otherId = ((int)$rel['from_user_id'] === (int)$userId) ? (int)$rel['to_user_id'] : (int)$rel['from_user_id'];
            $connectedIds[$otherId] = true;
        }

        if (empty($connectedIds)) {
            echo json_encode(array());
            return;
        }

        $result = array();
        foreach (array_keys($connectedIds) as $connId) {
            // Buscar el book_id de este usuario para este stored_file_id
            $stmt = $db->prepare('SELECT id FROM books WHERE user_id = ? AND stored_file_id = ?');
            $stmt->execute(array($connId, $storedFileId));
            $theirBook = $stmt->fetch();
            if (!$theirBook) continue;

            // Obtener notas compartidas
            $stmt = $db->prepare('
                SELECT n.id, n.chapter_index, n.content, n.highlight_text, n.color, n.audio_path, n.audio_duration, n.created_at,
                       u.username, u.avatar
                FROM notes n
                JOIN users u ON u.id = n.user_id
                WHERE n.book_id = ? AND n.user_id = ? AND n.is_shared = 1
                ORDER BY n.chapter_index, n.created_at
            ');
            $stmt->execute(array($theirBook['id'], $connId));
            $notes = $stmt->fetchAll();

            foreach ($notes as &$n) {
                $n['id'] = (int)$n['id'];
                $n['chapter_index'] = (int)$n['chapter_index'];
                $n['user_id'] = (int)$connId;
                $n['audio_duration'] = $n['audio_duration'] !== null ? (int)$n['audio_duration'] : null;
                $n['has_audio'] = !empty($n['audio_path']);
                unset($n['audio_path']); // No exponer path, usar endpoint de streaming
            }
            unset($n);

            $result = array_merge($result, $notes);
        }

        echo json_encode($result);
    }

    // POST /api/books/{id}/voice-notes — Subir nota de voz (solo suscriptores)
    public function uploadVoiceNote($params)
    {
        $bookId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Verificar is_subscriber
        $stmt = $db->prepare('SELECT is_subscriber FROM users WHERE id = ?');
        $stmt->execute(array($userId));
        $user = $stmt->fetch();
        if (!$user || (int)$user['is_subscriber'] !== 1) {
            http_response_code(403);
            echo json_encode(array('error' => 'Solo los suscriptores pueden crear notas de voz'));
            return;
        }

        // Verificar límite (50 notas de voz por libro)
        $stmt = $db->prepare('SELECT COUNT(*) FROM notes WHERE book_id = ? AND user_id = ? AND audio_path IS NOT NULL');
        $stmt->execute(array($bookId, $userId));
        $voiceCount = (int)$stmt->fetchColumn();
        if ($voiceCount >= 50) {
            http_response_code(422);
            echo json_encode(array('error' => 'Límite de 50 notas de voz por libro alcanzado'));
            return;
        }

        if (!isset($_FILES['audio'])) {
            http_response_code(422);
            echo json_encode(array('error' => 'No se envió archivo de audio'));
            return;
        }

        $audioFile = $_FILES['audio'];

        // Validar Content-Type
        $allowedTypes = array('audio/webm', 'audio/ogg', 'audio/webm;codecs=opus', 'application/ogg');
        $fileType = $audioFile['type'];
        $typeOk = false;
        foreach ($allowedTypes as $at) {
            if (strpos($fileType, $at) !== false || strpos($at, $fileType) !== false) {
                $typeOk = true;
                break;
            }
        }
        if (!$typeOk) {
            // Check extension as fallback
            $ext = strtolower(pathinfo($audioFile['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, array('webm', 'ogg'))) {
                http_response_code(422);
                echo json_encode(array('error' => 'Solo se permiten archivos audio webm/ogg'));
                return;
            }
        }

        // Max 50KB
        if ($audioFile['size'] > 51200) {
            http_response_code(422);
            echo json_encode(array('error' => 'El audio excede el tamaño máximo (50KB)'));
            return;
        }

        $duration = isset($_POST['duration']) ? (int)$_POST['duration'] : 0;
        if ($duration > 10) {
            http_response_code(422);
            echo json_encode(array('error' => 'La nota de voz no puede exceder 10 segundos'));
            return;
        }

        $chapterIndex = isset($_POST['chapter_index']) ? (int)$_POST['chapter_index'] : 0;
        $content = isset($_POST['content']) ? trim($_POST['content']) : '';

        // Guardar audio
        $ext = strtolower(pathinfo($audioFile['name'], PATHINFO_EXTENSION));
        if (empty($ext)) $ext = 'webm';
        $audioName = 'voice_' . $userId . '_' . time() . '.' . $ext;
        $audioDir = dirname(__DIR__, 2) . '/uploads/voice_notes';
        if (!is_dir($audioDir)) mkdir($audioDir, 0755, true);
        $audioPath = $audioDir . '/' . $audioName;

        // Intentar subir via StorageManager, fallback a local
        $storagePath = 'voice_notes/' . $audioName;
        $sm = StorageManager::getInstance();
        $driver = $sm->getDriver();
        $activeProvider = $sm->getActiveProvider();

        if ($activeProvider === 'local') {
            move_uploaded_file($audioFile['tmp_name'], $audioPath);
        } else {
            // Guardar temporal y subir
            move_uploaded_file($audioFile['tmp_name'], $audioPath);
            $contentType = $ext === 'ogg' ? 'audio/ogg' : 'audio/webm';
            $result = $driver->upload($audioPath, $storagePath, $contentType);
            if ($result) {
                @unlink($audioPath);
            } else {
                // Fallback local
                $storagePath = 'voice_notes/' . $audioName;
            }
        }

        // Crear nota con audio
        $stmt = $db->prepare('
            INSERT INTO notes (user_id, book_id, chapter_index, content, audio_path, audio_duration)
            VALUES (?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute(array($userId, $bookId, $chapterIndex, $content, $storagePath, $duration));

        http_response_code(201);
        echo json_encode(array('id' => (int)$db->lastInsertId(), 'audio_duration' => $duration));
    }

    // GET /api/voice-notes/{id}/audio — Streaming audio
    public function streamVoiceAudio($params)
    {
        $noteId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Obtener la nota
        $stmt = $db->prepare('SELECT n.*, b.stored_file_id FROM notes n JOIN books b ON b.id = n.book_id WHERE n.id = ?');
        $stmt->execute(array($noteId));
        $note = $stmt->fetch();

        if (!$note || empty($note['audio_path'])) {
            http_response_code(404);
            echo json_encode(array('error' => 'Nota de voz no encontrada'));
            return;
        }

        // Verificar acceso: es dueño o tiene relación via shares + nota compartida
        $isOwner = ((int)$note['user_id'] === (int)$userId);
        if (!$isOwner) {
            if ((int)$note['is_shared'] !== 1) {
                http_response_code(403);
                echo json_encode(array('error' => 'Sin acceso a esta nota'));
                return;
            }
            // Verificar relación via shares
            $storedFileId = $note['stored_file_id'];
            if (!empty($storedFileId)) {
                $stmt = $db->prepare('
                    SELECT id FROM book_shares
                    WHERE stored_file_id = ? AND status = ? AND (from_user_id = ? OR to_user_id = ?)
                ');
                $stmt->execute(array($storedFileId, 'accepted', $userId, $userId));
                if (!$stmt->fetch()) {
                    http_response_code(403);
                    echo json_encode(array('error' => 'Sin acceso a esta nota'));
                    return;
                }
            }
        }

        $audioPath = $note['audio_path'];
        $ext = strtolower(pathinfo($audioPath, PATHINFO_EXTENSION));
        $mime = ($ext === 'ogg') ? 'audio/ogg' : 'audio/webm';

        // Intentar desde storage local
        $localPath = dirname(__DIR__, 2) . '/uploads/' . $audioPath;
        if (file_exists($localPath)) {
            header('Content-Type: ' . $mime);
            header('Content-Length: ' . filesize($localPath));
            readfile($localPath);
            exit;
        }

        // Intentar desde proveedor remoto
        $sm = StorageManager::getInstance();
        $driver = $sm->getDriver();
        header('Content-Type: ' . $mime);
        $driver->download($audioPath, null);
        exit;
    }

    // DELETE /api/voice-notes/{id} — Eliminar nota de voz
    public function deleteVoiceNote($params)
    {
        $noteId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Verificar que la nota pertenece al usuario
        $stmt = $db->prepare('SELECT id, audio_path FROM notes WHERE id = ? AND user_id = ?');
        $stmt->execute(array($noteId, $userId));
        $note = $stmt->fetch();

        if (!$note) {
            http_response_code(404);
            echo json_encode(array('error' => 'Nota no encontrada'));
            return;
        }

        // Eliminar audio de storage
        if (!empty($note['audio_path'])) {
            $localPath = dirname(__DIR__, 2) . '/uploads/' . $note['audio_path'];
            if (file_exists($localPath)) {
                @unlink($localPath);
            } else {
                // Intentar eliminar de storage remoto
                $sm = StorageManager::getInstance();
                $driver = $sm->getDriver();
                $driver->delete($note['audio_path'], null);
            }
        }

        // Eliminar nota de BD
        $db->prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')->execute(array($noteId, $userId));
        echo json_encode(array('ok' => true));
    }
}
