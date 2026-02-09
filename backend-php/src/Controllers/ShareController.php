<?php

class ShareController
{
    // GET /api/users/search?q=term
    public function searchUsers($params)
    {
        $q = isset($_GET['q']) ? trim($_GET['q']) : '';
        if (strlen($q) < 2) {
            echo json_encode(array());
            return;
        }

        $db = Database::get();
        $stmt = $db->prepare('SELECT id, username, avatar FROM users WHERE username LIKE ? AND id != ? LIMIT 10');
        $stmt->execute(array('%' . $q . '%', $params['user_id']));
        $users = $stmt->fetchAll();

        foreach ($users as &$u) {
            $u['id'] = (int)$u['id'];
        }
        unset($u);

        echo json_encode($users);
    }

    // POST /api/books/{id}/share
    public function shareBook($params)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $bookId = $params['id'];
        $fromUserId = $params['user_id'];
        $toUserId = isset($data['to_user_id']) ? (int)$data['to_user_id'] : 0;
        $message = isset($data['message']) ? trim($data['message']) : null;

        if ($toUserId === 0) {
            http_response_code(422);
            echo json_encode(array('error' => 'Destinatario no especificado'));
            return;
        }

        if ($toUserId === (int)$fromUserId) {
            http_response_code(422);
            echo json_encode(array('error' => 'No puedes compartir un libro contigo mismo'));
            return;
        }

        $db = Database::get();

        // Verificar que el libro existe y es del usuario
        $stmt = $db->prepare('SELECT b.*, sf.id as sf_id FROM books b LEFT JOIN stored_files sf ON sf.id = b.stored_file_id WHERE b.id = ? AND b.user_id = ?');
        $stmt->execute(array($bookId, $fromUserId));
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(404);
            echo json_encode(array('error' => 'Libro no encontrado'));
            return;
        }

        if (empty($book['sf_id'])) {
            http_response_code(422);
            echo json_encode(array('error' => 'Este libro no tiene un archivo almacenado compartible'));
            return;
        }

        $storedFileId = (int)$book['sf_id'];

        // Verificar que el destinatario existe
        $stmt = $db->prepare('SELECT id FROM users WHERE id = ?');
        $stmt->execute(array($toUserId));
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(array('error' => 'Usuario destinatario no encontrado'));
            return;
        }

        // Verificar que no hay invitación pendiente duplicada
        $stmt = $db->prepare('SELECT id FROM book_shares WHERE stored_file_id = ? AND from_user_id = ? AND to_user_id = ? AND status = ?');
        $stmt->execute(array($storedFileId, $fromUserId, $toUserId, 'pending'));
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(array('error' => 'Ya existe una invitación pendiente para este libro y usuario'));
            return;
        }

        // Verificar que el destinatario no tiene ya el archivo
        $stmt = $db->prepare('SELECT id FROM books WHERE user_id = ? AND stored_file_id = ?');
        $stmt->execute(array($toUserId, $storedFileId));
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(array('error' => 'El usuario ya tiene este libro en su biblioteca'));
            return;
        }

        // Crear invitación con snapshot de metadata
        $stmt = $db->prepare('
            INSERT INTO book_shares (book_id, stored_file_id, from_user_id, to_user_id, status, message,
                snap_title, snap_author, snap_description, snap_cover_base64, snap_file_name, snap_file_size, snap_file_type, snap_total_chapters, snap_book_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute(array(
            $bookId, $storedFileId, $fromUserId, $toUserId, 'pending', $message,
            $book['title'], $book['author'], $book['description'], $book['cover_base64'],
            $book['file_name'], (int)$book['file_size'], $book['file_type'], (int)$book['total_chapters'], $book['book_hash']
        ));

        http_response_code(201);
        echo json_encode(array('ok' => true, 'id' => (int)$db->lastInsertId()));
    }

    // GET /api/shares/pending
    public function pendingShares($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('
            SELECT bs.*, u.username as from_username, u.avatar as from_avatar
            FROM book_shares bs
            JOIN users u ON u.id = bs.from_user_id
            WHERE bs.to_user_id = ? AND bs.status = ?
            ORDER BY bs.created_at DESC
        ');
        $stmt->execute(array($params['user_id'], 'pending'));
        $shares = $stmt->fetchAll();

        foreach ($shares as &$s) {
            $s['id'] = (int)$s['id'];
            $s['book_id'] = $s['book_id'] !== null ? (int)$s['book_id'] : null;
            $s['stored_file_id'] = (int)$s['stored_file_id'];
            $s['from_user_id'] = (int)$s['from_user_id'];
            $s['to_user_id'] = (int)$s['to_user_id'];
            $s['snap_file_size'] = (int)$s['snap_file_size'];
            $s['snap_total_chapters'] = (int)$s['snap_total_chapters'];
        }
        unset($s);

        echo json_encode($shares);
    }

    // GET /api/shares/pending/count
    public function pendingCount($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT COUNT(*) FROM book_shares WHERE to_user_id = ? AND status = ?');
        $stmt->execute(array($params['user_id'], 'pending'));
        $count = (int)$stmt->fetchColumn();

        echo json_encode(array('count' => $count));
    }

    // POST /api/shares/{id}/accept
    public function acceptShare($params)
    {
        $shareId = $params['id'];
        $db = Database::get();

        $stmt = $db->prepare('SELECT * FROM book_shares WHERE id = ? AND to_user_id = ? AND status = ?');
        $stmt->execute(array($shareId, $params['user_id'], 'pending'));
        $share = $stmt->fetch();

        if (!$share) {
            http_response_code(404);
            echo json_encode(array('error' => 'Invitación no encontrada'));
            return;
        }

        $storedFileId = (int)$share['stored_file_id'];
        $userId = $params['user_id'];

        // Verificar que no tenga ya el archivo
        $stmt = $db->prepare('SELECT id FROM books WHERE user_id = ? AND stored_file_id = ?');
        $stmt->execute(array($userId, $storedFileId));
        if ($stmt->fetch()) {
            // Marcar como aceptado igualmente
            $db->prepare('UPDATE book_shares SET status = ? WHERE id = ?')->execute(array('accepted', $shareId));
            echo json_encode(array('ok' => true, 'already_had' => true));
            return;
        }

        // Obtener info del stored_file
        $stmt = $db->prepare('SELECT * FROM stored_files WHERE id = ?');
        $stmt->execute(array($storedFileId));
        $storedFile = $stmt->fetch();

        if (!$storedFile) {
            http_response_code(404);
            echo json_encode(array('error' => 'Archivo de origen no encontrado'));
            return;
        }

        // Crear nuevo registro en books para el destinatario usando snapshot
        $stmt = $db->prepare('
            INSERT INTO books (user_id, title, author, description, file_name, file_path, file_size, file_type, cover_base64, total_chapters, storage_type, storage_file_id, book_hash, stored_file_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute(array(
            $userId,
            $share['snap_title'],
            $share['snap_author'],
            $share['snap_description'],
            $share['snap_file_name'],
            $storedFile['storage_path'],
            (int)$share['snap_file_size'],
            $share['snap_file_type'],
            $share['snap_cover_base64'],
            (int)$share['snap_total_chapters'],
            $storedFile['storage_type'],
            $storedFile['storage_file_id'],
            $share['snap_book_hash'],
            $storedFileId
        ));

        // NO incrementar storage_used (el archivo ya existía)

        // Marcar como aceptado
        $db->prepare('UPDATE book_shares SET status = ? WHERE id = ?')->execute(array('accepted', $shareId));

        echo json_encode(array('ok' => true, 'book_id' => (int)$db->lastInsertId()));
    }

    // POST /api/shares/{id}/reject
    public function rejectShare($params)
    {
        $shareId = $params['id'];
        $db = Database::get();

        $stmt = $db->prepare('SELECT id FROM book_shares WHERE id = ? AND to_user_id = ? AND status = ?');
        $stmt->execute(array($shareId, $params['user_id'], 'pending'));
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(array('error' => 'Invitación no encontrada'));
            return;
        }

        $db->prepare('UPDATE book_shares SET status = ? WHERE id = ?')->execute(array('rejected', $shareId));
        echo json_encode(array('ok' => true));
    }

    // GET /api/books/{id}/shared-progress
    public function sharedProgress($params)
    {
        $bookId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Obtener stored_file_id del libro del usuario actual
        $stmt = $db->prepare('SELECT stored_file_id FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute(array($bookId, $userId));
        $book = $stmt->fetch();

        if (!$book || empty($book['stored_file_id'])) {
            echo json_encode(array());
            return;
        }

        $storedFileId = (int)$book['stored_file_id'];

        // Buscar relaciones directas (accepted) donde este usuario participa para este stored_file_id
        $stmt = $db->prepare('
            SELECT from_user_id, to_user_id FROM book_shares
            WHERE stored_file_id = ? AND status = ? AND (from_user_id = ? OR to_user_id = ?)
        ');
        $stmt->execute(array($storedFileId, 'accepted', $userId, $userId));
        $relations = $stmt->fetchAll();

        // Recolectar user_ids conectados
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

            $progress = array(
                'user_id' => (int)$connId,
                'username' => '',
                'avatar' => null,
                'progress_percent' => 0,
                'current_chapter' => 0,
                'current_page' => 0,
                'last_read' => null,
            );

            // Obtener username y avatar
            $stmt = $db->prepare('SELECT username, avatar FROM users WHERE id = ?');
            $stmt->execute(array($connId));
            $userInfo = $stmt->fetch();
            if ($userInfo) {
                $progress['username'] = $userInfo['username'];
                $progress['avatar'] = $userInfo['avatar'];
            }

            // Obtener progreso de lectura
            if ($theirBook) {
                $stmt = $db->prepare('SELECT current_chapter, current_page, progress_percent, last_read FROM reading_progress WHERE book_id = ? AND user_id = ?');
                $stmt->execute(array($theirBook['id'], $connId));
                $rp = $stmt->fetch();
                if ($rp) {
                    $progress['progress_percent'] = (int)$rp['progress_percent'];
                    $progress['current_chapter'] = (int)$rp['current_chapter'];
                    $progress['current_page'] = (int)$rp['current_page'];
                    $progress['last_read'] = $rp['last_read'];
                }
            }

            $result[] = $progress;
        }

        echo json_encode($result);
    }
}
