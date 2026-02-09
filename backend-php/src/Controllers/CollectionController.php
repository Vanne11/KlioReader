<?php

class CollectionController
{
    // POST /api/collections
    public function create($params)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $userId = $params['user_id'];
        $name = isset($data['name']) ? trim($data['name']) : '';
        $description = isset($data['description']) ? trim($data['description']) : null;
        $type = isset($data['type']) ? trim($data['type']) : 'collection';
        $coverBase64 = isset($data['cover_base64']) ? $data['cover_base64'] : null;
        $sortOrder = isset($data['sort_order']) ? trim($data['sort_order']) : 'manual';

        if ($name === '') {
            http_response_code(422);
            echo json_encode(array('error' => 'El nombre es obligatorio'));
            return;
        }

        if (!in_array($type, array('saga', 'collection'))) {
            http_response_code(422);
            echo json_encode(array('error' => 'Tipo inválido'));
            return;
        }

        if (!in_array($sortOrder, array('manual', 'title', 'added'))) {
            $sortOrder = 'manual';
        }

        $db = Database::get();
        $stmt = $db->prepare('INSERT INTO collections (user_id, name, description, type, cover_base64, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute(array($userId, $name, $description, $type, $coverBase64, $sortOrder));

        $id = (int)$db->lastInsertId();

        http_response_code(201);
        echo json_encode(array(
            'ok' => true,
            'id' => $id,
            'name' => $name,
            'type' => $type
        ));
    }

    // GET /api/collections
    public function listCollections($params)
    {
        $userId = $params['user_id'];
        $db = Database::get();

        $stmt = $db->prepare('
            SELECT c.*, COUNT(cb.id) as book_count
            FROM collections c
            LEFT JOIN collection_books cb ON cb.collection_id = c.id
            WHERE c.user_id = ?
            GROUP BY c.id
            ORDER BY c.created_at DESC
        ');
        $stmt->execute(array($userId));
        $collections = $stmt->fetchAll();

        foreach ($collections as &$c) {
            $c['id'] = (int)$c['id'];
            $c['user_id'] = (int)$c['user_id'];
            $c['book_count'] = (int)$c['book_count'];
        }
        unset($c);

        echo json_encode($collections);
    }

    // GET /api/collections/{id}
    public function get($params)
    {
        $collectionId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        $stmt = $db->prepare('SELECT * FROM collections WHERE id = ? AND user_id = ?');
        $stmt->execute(array($collectionId, $userId));
        $collection = $stmt->fetch();

        if (!$collection) {
            http_response_code(404);
            echo json_encode(array('error' => 'Colección no encontrada'));
            return;
        }

        $collection['id'] = (int)$collection['id'];
        $collection['user_id'] = (int)$collection['user_id'];

        // Obtener libros de la colección
        $orderClause = 'cb.order_index ASC';
        if ($collection['sort_order'] === 'title') {
            $orderClause = 'b.title ASC';
        } elseif ($collection['sort_order'] === 'added') {
            $orderClause = 'cb.added_at DESC';
        }

        $stmt = $db->prepare('
            SELECT b.*, cb.order_index, cb.display_name as cb_display_name, cb.added_at as cb_added_at
            FROM collection_books cb
            JOIN books b ON b.id = cb.book_id
            WHERE cb.collection_id = ?
            ORDER BY ' . $orderClause
        );
        $stmt->execute(array($collectionId));
        $books = $stmt->fetchAll();

        foreach ($books as &$bk) {
            $bk['id'] = (int)$bk['id'];
            $bk['user_id'] = (int)$bk['user_id'];
            $bk['file_size'] = (int)$bk['file_size'];
            $bk['total_chapters'] = (int)$bk['total_chapters'];
            $bk['order_index'] = (int)$bk['order_index'];
            $bk['stored_file_id'] = $bk['stored_file_id'] !== null ? (int)$bk['stored_file_id'] : null;
        }
        unset($bk);

        $collection['books'] = $books;
        $collection['book_count'] = count($books);

        echo json_encode($collection);
    }

    // PUT /api/collections/{id}
    public function update($params)
    {
        $collectionId = $params['id'];
        $userId = $params['user_id'];
        $data = json_decode(file_get_contents('php://input'), true);
        $db = Database::get();

        // Verificar que existe y es del usuario
        $stmt = $db->prepare('SELECT id FROM collections WHERE id = ? AND user_id = ?');
        $stmt->execute(array($collectionId, $userId));
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(array('error' => 'Colección no encontrada'));
            return;
        }

        $fields = array();
        $values = array();

        if (isset($data['name']) && trim($data['name']) !== '') {
            $fields[] = 'name = ?';
            $values[] = trim($data['name']);
        }
        if (array_key_exists('description', $data)) {
            $fields[] = 'description = ?';
            $values[] = $data['description'];
        }
        if (isset($data['cover_base64'])) {
            $fields[] = 'cover_base64 = ?';
            $values[] = $data['cover_base64'];
        }
        if (isset($data['sort_order']) && in_array($data['sort_order'], array('manual', 'title', 'added'))) {
            $fields[] = 'sort_order = ?';
            $values[] = $data['sort_order'];
        }

        if (empty($fields)) {
            echo json_encode(array('ok' => true));
            return;
        }

        $fields[] = "updated_at = datetime('now')";
        $values[] = $collectionId;

        $sql = 'UPDATE collections SET ' . implode(', ', $fields) . ' WHERE id = ?';
        $db->prepare($sql)->execute($values);

        echo json_encode(array('ok' => true));
    }

    // DELETE /api/collections/{id}
    public function delete($params)
    {
        $collectionId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        $stmt = $db->prepare('SELECT id FROM collections WHERE id = ? AND user_id = ?');
        $stmt->execute(array($collectionId, $userId));
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(array('error' => 'Colección no encontrada'));
            return;
        }

        // CASCADE borra collection_books automáticamente
        $db->prepare('DELETE FROM collections WHERE id = ?')->execute(array($collectionId));

        echo json_encode(array('ok' => true));
    }

    // POST /api/collections/{id}/books
    public function addBooks($params)
    {
        $collectionId = $params['id'];
        $userId = $params['user_id'];
        $data = json_decode(file_get_contents('php://input'), true);
        $bookIds = isset($data['book_ids']) ? $data['book_ids'] : array();

        if (empty($bookIds)) {
            http_response_code(422);
            echo json_encode(array('error' => 'No se especificaron libros'));
            return;
        }

        $db = Database::get();

        // Verificar que la colección existe y es del usuario
        $stmt = $db->prepare('SELECT id FROM collections WHERE id = ? AND user_id = ?');
        $stmt->execute(array($collectionId, $userId));
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(array('error' => 'Colección no encontrada'));
            return;
        }

        // Obtener el máximo order_index actual
        $stmt = $db->prepare('SELECT COALESCE(MAX(order_index), -1) FROM collection_books WHERE collection_id = ?');
        $stmt->execute(array($collectionId));
        $maxOrder = (int)$stmt->fetchColumn();

        $added = 0;
        foreach ($bookIds as $bookId) {
            $bookId = (int)$bookId;

            // Verificar que el libro existe y es del usuario
            $stmt = $db->prepare('SELECT id FROM books WHERE id = ? AND user_id = ?');
            $stmt->execute(array($bookId, $userId));
            if (!$stmt->fetch()) {
                continue;
            }

            // INSERT OR IGNORE para evitar duplicados
            $maxOrder++;
            $displayName = isset($data['display_names'][$bookId]) ? $data['display_names'][$bookId] : null;
            $stmt = $db->prepare('INSERT OR IGNORE INTO collection_books (collection_id, book_id, order_index, display_name) VALUES (?, ?, ?, ?)');
            $stmt->execute(array($collectionId, $bookId, $maxOrder, $displayName));

            if ($stmt->rowCount() > 0) {
                $added++;
            }
        }

        // Actualizar updated_at
        $db->prepare("UPDATE collections SET updated_at = datetime('now') WHERE id = ?")->execute(array($collectionId));

        echo json_encode(array('ok' => true, 'added' => $added));
    }

    // DELETE /api/collections/{id}/books/{bookId}
    public function removeBook($params)
    {
        $collectionId = $params['id'];
        $bookId = $params['bookId'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Verificar propiedad de la colección
        $stmt = $db->prepare('SELECT id FROM collections WHERE id = ? AND user_id = ?');
        $stmt->execute(array($collectionId, $userId));
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(array('error' => 'Colección no encontrada'));
            return;
        }

        $db->prepare('DELETE FROM collection_books WHERE collection_id = ? AND book_id = ?')->execute(array($collectionId, $bookId));
        $db->prepare("UPDATE collections SET updated_at = datetime('now') WHERE id = ?")->execute(array($collectionId));

        echo json_encode(array('ok' => true));
    }

    // PUT /api/collections/{id}/reorder
    public function reorder($params)
    {
        $collectionId = $params['id'];
        $userId = $params['user_id'];
        $data = json_decode(file_get_contents('php://input'), true);
        $bookIds = isset($data['book_ids']) ? $data['book_ids'] : array();

        $db = Database::get();

        // Verificar propiedad
        $stmt = $db->prepare('SELECT id FROM collections WHERE id = ? AND user_id = ?');
        $stmt->execute(array($collectionId, $userId));
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(array('error' => 'Colección no encontrada'));
            return;
        }

        // Actualizar orden
        $stmt = $db->prepare('UPDATE collection_books SET order_index = ? WHERE collection_id = ? AND book_id = ?');
        foreach ($bookIds as $index => $bookId) {
            $stmt->execute(array((int)$index, $collectionId, (int)$bookId));
        }

        // Permitir actualizar display_names si se envían
        if (isset($data['display_names']) && is_array($data['display_names'])) {
            $stmtDn = $db->prepare('UPDATE collection_books SET display_name = ? WHERE collection_id = ? AND book_id = ?');
            foreach ($data['display_names'] as $bookId => $displayName) {
                $stmtDn->execute(array($displayName, $collectionId, (int)$bookId));
            }
        }

        $db->prepare("UPDATE collections SET updated_at = datetime('now') WHERE id = ?")->execute(array($collectionId));

        echo json_encode(array('ok' => true));
    }

    // POST /api/collections/{id}/share
    public function share($params)
    {
        $collectionId = $params['id'];
        $userId = $params['user_id'];
        $data = json_decode(file_get_contents('php://input'), true);
        $toUserId = isset($data['to_user_id']) ? (int)$data['to_user_id'] : 0;
        $message = isset($data['message']) ? trim($data['message']) : null;

        if ($toUserId === 0) {
            http_response_code(422);
            echo json_encode(array('error' => 'Destinatario no especificado'));
            return;
        }

        if ($toUserId === (int)$userId) {
            http_response_code(422);
            echo json_encode(array('error' => 'No puedes compartir una colección contigo mismo'));
            return;
        }

        $db = Database::get();

        // Verificar que la colección existe y es del usuario
        $stmt = $db->prepare('SELECT * FROM collections WHERE id = ? AND user_id = ?');
        $stmt->execute(array($collectionId, $userId));
        $collection = $stmt->fetch();

        if (!$collection) {
            http_response_code(404);
            echo json_encode(array('error' => 'Colección no encontrada'));
            return;
        }

        // Verificar destinatario
        $stmt = $db->prepare('SELECT id FROM users WHERE id = ?');
        $stmt->execute(array($toUserId));
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(array('error' => 'Usuario destinatario no encontrado'));
            return;
        }

        // Verificar duplicado pendiente
        $stmt = $db->prepare('SELECT id FROM collection_shares WHERE collection_id = ? AND from_user_id = ? AND to_user_id = ? AND status = ?');
        $stmt->execute(array($collectionId, $userId, $toUserId, 'pending'));
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(array('error' => 'Ya existe una invitación pendiente para esta colección'));
            return;
        }

        // Contar libros
        $stmt = $db->prepare('SELECT COUNT(*) FROM collection_books WHERE collection_id = ?');
        $stmt->execute(array($collectionId));
        $bookCount = (int)$stmt->fetchColumn();

        // Crear invitación con snapshot
        $stmt = $db->prepare('
            INSERT INTO collection_shares (collection_id, from_user_id, to_user_id, status, message, snap_name, snap_description, snap_cover_base64, snap_book_count, snap_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute(array(
            $collectionId, $userId, $toUserId, 'pending', $message,
            $collection['name'], $collection['description'], $collection['cover_base64'],
            $bookCount, $collection['type']
        ));

        http_response_code(201);
        echo json_encode(array('ok' => true, 'id' => (int)$db->lastInsertId()));
    }

    // GET /api/collection-shares/pending
    public function pendingShares($params)
    {
        $userId = $params['user_id'];
        $db = Database::get();

        $stmt = $db->prepare('
            SELECT cs.*, u.username as from_username, u.avatar as from_avatar
            FROM collection_shares cs
            JOIN users u ON u.id = cs.from_user_id
            WHERE cs.to_user_id = ? AND cs.status = ?
            ORDER BY cs.created_at DESC
        ');
        $stmt->execute(array($userId, 'pending'));
        $shares = $stmt->fetchAll();

        foreach ($shares as &$s) {
            $s['id'] = (int)$s['id'];
            $s['collection_id'] = (int)$s['collection_id'];
            $s['from_user_id'] = (int)$s['from_user_id'];
            $s['to_user_id'] = (int)$s['to_user_id'];
            $s['snap_book_count'] = (int)$s['snap_book_count'];
        }
        unset($s);

        echo json_encode($shares);
    }

    // GET /api/collection-shares/pending/count
    public function pendingCount($params)
    {
        $userId = $params['user_id'];
        $db = Database::get();

        $stmt = $db->prepare('SELECT COUNT(*) FROM collection_shares WHERE to_user_id = ? AND status = ?');
        $stmt->execute(array($userId, 'pending'));
        $count = (int)$stmt->fetchColumn();

        echo json_encode(array('count' => $count));
    }

    // POST /api/collection-shares/{id}/accept
    public function acceptShare($params)
    {
        $shareId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Obtener la invitación
        $stmt = $db->prepare('SELECT * FROM collection_shares WHERE id = ? AND to_user_id = ? AND status = ?');
        $stmt->execute(array($shareId, $userId, 'pending'));
        $share = $stmt->fetch();

        if (!$share) {
            http_response_code(404);
            echo json_encode(array('error' => 'Invitación no encontrada'));
            return;
        }

        $fromCollectionId = (int)$share['collection_id'];

        // Crear nueva colección para el receptor
        $stmt = $db->prepare('INSERT INTO collections (user_id, name, description, type, cover_base64, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute(array(
            $userId,
            $share['snap_name'],
            $share['snap_description'],
            $share['snap_type'] ? $share['snap_type'] : 'collection',
            $share['snap_cover_base64'],
            'manual'
        ));
        $newCollectionId = (int)$db->lastInsertId();

        // Obtener libros de la colección original con su orden
        $stmt = $db->prepare('
            SELECT cb.book_id, cb.order_index, cb.display_name, b.stored_file_id, b.title, b.author, b.description, b.file_name, b.file_size, b.file_type, b.cover_base64, b.total_chapters, b.book_hash
            FROM collection_books cb
            JOIN books b ON b.id = cb.book_id
            WHERE cb.collection_id = ?
            ORDER BY cb.order_index ASC
        ');
        $stmt->execute(array($fromCollectionId));
        $sourceBooks = $stmt->fetchAll();

        $booksAdded = 0;

        foreach ($sourceBooks as $srcBook) {
            $storedFileId = $srcBook['stored_file_id'] !== null ? (int)$srcBook['stored_file_id'] : null;

            if ($storedFileId === null) {
                continue;
            }

            // Verificar si el receptor ya tiene este stored_file_id
            $stmt = $db->prepare('SELECT id FROM books WHERE user_id = ? AND stored_file_id = ?');
            $stmt->execute(array($userId, $storedFileId));
            $existingBook = $stmt->fetch();

            $targetBookId = null;

            if ($existingBook) {
                $targetBookId = (int)$existingBook['id'];
            } else {
                // Obtener info del stored_file para crear registro
                $stmt = $db->prepare('SELECT * FROM stored_files WHERE id = ?');
                $stmt->execute(array($storedFileId));
                $storedFile = $stmt->fetch();

                if (!$storedFile) {
                    continue;
                }

                // Crear registro en books para el receptor
                $stmt = $db->prepare('
                    INSERT INTO books (user_id, title, author, description, file_name, file_path, file_size, file_type, cover_base64, total_chapters, storage_type, storage_file_id, book_hash, stored_file_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ');
                $stmt->execute(array(
                    $userId,
                    $srcBook['title'],
                    $srcBook['author'],
                    $srcBook['description'],
                    $srcBook['file_name'],
                    $storedFile['storage_path'],
                    (int)$srcBook['file_size'],
                    $srcBook['file_type'],
                    $srcBook['cover_base64'],
                    (int)$srcBook['total_chapters'],
                    $storedFile['storage_type'],
                    $storedFile['storage_file_id'],
                    $srcBook['book_hash'],
                    $storedFileId
                ));
                $targetBookId = (int)$db->lastInsertId();
            }

            // Agregar a collection_books con el mismo orden y display_name
            if ($targetBookId !== null) {
                $stmt = $db->prepare('INSERT OR IGNORE INTO collection_books (collection_id, book_id, order_index, display_name) VALUES (?, ?, ?, ?)');
                $stmt->execute(array($newCollectionId, $targetBookId, (int)$srcBook['order_index'], $srcBook['display_name']));
                $booksAdded++;
            }
        }

        // Marcar como aceptado
        $db->prepare('UPDATE collection_shares SET status = ? WHERE id = ?')->execute(array('accepted', $shareId));

        echo json_encode(array(
            'ok' => true,
            'collection_id' => $newCollectionId,
            'books_added' => $booksAdded
        ));
    }

    // POST /api/collection-shares/{id}/reject
    public function rejectShare($params)
    {
        $shareId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        $stmt = $db->prepare('SELECT id FROM collection_shares WHERE id = ? AND to_user_id = ? AND status = ?');
        $stmt->execute(array($shareId, $userId, 'pending'));
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(array('error' => 'Invitación no encontrada'));
            return;
        }

        $db->prepare('UPDATE collection_shares SET status = ? WHERE id = ?')->execute(array('rejected', $shareId));

        echo json_encode(array('ok' => true));
    }
}
