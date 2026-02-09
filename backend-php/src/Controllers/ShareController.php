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

    // POST /api/books/{id}/races
    public function createRace($params)
    {
        $bookId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Verificar que el libro existe y es del usuario, obtener stored_file_id
        $stmt = $db->prepare('SELECT stored_file_id FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute(array($bookId, $userId));
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(404);
            echo json_encode(array('error' => 'Libro no encontrado'));
            return;
        }

        if (empty($book['stored_file_id'])) {
            http_response_code(422);
            echo json_encode(array('error' => 'Este libro no tiene un archivo almacenado compartible'));
            return;
        }

        $storedFileId = (int)$book['stored_file_id'];

        // Crear carrera
        $stmt = $db->prepare('INSERT INTO reading_races (stored_file_id, created_by) VALUES (?, ?)');
        $stmt->execute(array($storedFileId, $userId));
        $raceId = (int)$db->lastInsertId();

        // Insertar al creador como participante
        $stmt = $db->prepare('INSERT INTO race_participants (race_id, user_id) VALUES (?, ?)');
        $stmt->execute(array($raceId, $userId));

        // Actualizar social_stats
        $db->prepare('INSERT OR IGNORE INTO social_stats (user_id) VALUES (?)')->execute(array($userId));
        $db->prepare('UPDATE social_stats SET races_participated = races_participated + 1 WHERE user_id = ?')->execute(array($userId));

        http_response_code(201);
        echo json_encode(array('ok' => true, 'race_id' => $raceId));
    }

    // POST /api/races/{id}/join
    public function joinRace($params)
    {
        $raceId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Verificar que la carrera existe y está activa
        $stmt = $db->prepare('SELECT id, stored_file_id, status FROM reading_races WHERE id = ?');
        $stmt->execute(array($raceId));
        $race = $stmt->fetch();

        if (!$race) {
            http_response_code(404);
            echo json_encode(array('error' => 'Carrera no encontrada'));
            return;
        }

        if ($race['status'] !== 'active') {
            http_response_code(422);
            echo json_encode(array('error' => 'La carrera no está activa'));
            return;
        }

        $storedFileId = (int)$race['stored_file_id'];

        // Verificar que el usuario tiene acceso al libro
        // Opción 1: tiene el libro con ese stored_file_id
        $stmt = $db->prepare('SELECT id FROM books WHERE user_id = ? AND stored_file_id = ?');
        $stmt->execute(array($userId, $storedFileId));
        $hasBook = $stmt->fetch();

        if (!$hasBook) {
            // Opción 2: tiene acceso vía book_shares aceptado
            $stmt = $db->prepare('SELECT id FROM book_shares WHERE stored_file_id = ? AND to_user_id = ? AND status = ?');
            $stmt->execute(array($storedFileId, $userId, 'accepted'));
            $hasShare = $stmt->fetch();

            if (!$hasShare) {
                http_response_code(403);
                echo json_encode(array('error' => 'No tienes acceso a este libro'));
                return;
            }
        }

        // Insertar participante (INSERT OR IGNORE para evitar duplicados)
        $stmt = $db->prepare('INSERT OR IGNORE INTO race_participants (race_id, user_id) VALUES (?, ?)');
        $stmt->execute(array($raceId, $userId));

        // Actualizar social_stats
        $db->prepare('INSERT OR IGNORE INTO social_stats (user_id) VALUES (?)')->execute(array($userId));
        $db->prepare('UPDATE social_stats SET races_participated = races_participated + 1 WHERE user_id = ?')->execute(array($userId));

        echo json_encode(array('ok' => true));
    }

    // GET /api/races/{id}/leaderboard
    public function raceLeaderboard($params)
    {
        $raceId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Verificar que la carrera existe
        $stmt = $db->prepare('SELECT id, stored_file_id, created_by, status, winner_user_id FROM reading_races WHERE id = ?');
        $stmt->execute(array($raceId));
        $race = $stmt->fetch();

        if (!$race) {
            http_response_code(404);
            echo json_encode(array('error' => 'Carrera no encontrada'));
            return;
        }

        $storedFileId = (int)$race['stored_file_id'];

        // Obtener participantes
        $stmt = $db->prepare('
            SELECT rp.user_id, u.username, u.avatar, rp.joined_at, rp.finished_at
            FROM race_participants rp
            JOIN users u ON u.id = rp.user_id
            WHERE rp.race_id = ?
        ');
        $stmt->execute(array($raceId));
        $participants = $stmt->fetchAll();

        $leaderboard = array();

        // Para cada participante, obtener su progreso
        foreach ($participants as $p) {
            $participantId = (int)$p['user_id'];

            // Buscar su book_id con este stored_file_id
            $stmt = $db->prepare('SELECT id FROM books WHERE user_id = ? AND stored_file_id = ?');
            $stmt->execute(array($participantId, $storedFileId));
            $book = $stmt->fetch();

            $progressPercent = 0;

            if ($book) {
                $bookId = (int)$book['id'];
                $stmt = $db->prepare('SELECT progress_percent FROM reading_progress WHERE book_id = ? AND user_id = ?');
                $stmt->execute(array($bookId, $participantId));
                $progress = $stmt->fetch();
                if ($progress) {
                    $progressPercent = (int)$progress['progress_percent'];
                }
            }

            $leaderboard[] = array(
                'user_id' => $participantId,
                'username' => $p['username'],
                'avatar' => $p['avatar'],
                'joined_at' => $p['joined_at'],
                'finished_at' => $p['finished_at'],
                'progress_percent' => $progressPercent
            );
        }

        // Ordenar por progreso DESC, joined_at ASC
        usort($leaderboard, function ($a, $b) {
            if ($a['progress_percent'] !== $b['progress_percent']) {
                return $b['progress_percent'] - $a['progress_percent'];
            }
            return strcmp($a['joined_at'], $b['joined_at']);
        });

        echo json_encode(array(
            'race' => array(
                'id' => (int)$race['id'],
                'stored_file_id' => $storedFileId,
                'created_by' => (int)$race['created_by'],
                'status' => $race['status'],
                'winner_user_id' => $race['winner_user_id'] !== null ? (int)$race['winner_user_id'] : null
            ),
            'leaderboard' => $leaderboard
        ));
    }

    // POST /api/races/{id}/finish
    public function finishRace($params)
    {
        $raceId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Verificar que la carrera está activa
        $stmt = $db->prepare('SELECT id, stored_file_id, status, winner_user_id FROM reading_races WHERE id = ?');
        $stmt->execute(array($raceId));
        $race = $stmt->fetch();

        if (!$race) {
            http_response_code(404);
            echo json_encode(array('error' => 'Carrera no encontrada'));
            return;
        }

        if ($race['status'] !== 'active') {
            http_response_code(422);
            echo json_encode(array('error' => 'La carrera no está activa'));
            return;
        }

        // Verificar que el usuario es participante
        $stmt = $db->prepare('SELECT id FROM race_participants WHERE race_id = ? AND user_id = ?');
        $stmt->execute(array($raceId, $userId));
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(array('error' => 'No eres participante de esta carrera'));
            return;
        }

        $storedFileId = (int)$race['stored_file_id'];

        // Verificar que el usuario tiene 100% de progreso
        $stmt = $db->prepare('SELECT id FROM books WHERE user_id = ? AND stored_file_id = ?');
        $stmt->execute(array($userId, $storedFileId));
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(422);
            echo json_encode(array('error' => 'No tienes este libro'));
            return;
        }

        $bookId = (int)$book['id'];
        $stmt = $db->prepare('SELECT progress_percent FROM reading_progress WHERE book_id = ? AND user_id = ?');
        $stmt->execute(array($bookId, $userId));
        $progress = $stmt->fetch();

        if (!$progress || (int)$progress['progress_percent'] < 100) {
            http_response_code(422);
            echo json_encode(array('error' => 'Debes completar el libro al 100% para finalizar'));
            return;
        }

        // Marcar como terminado
        $stmt = $db->prepare('UPDATE race_participants SET finished_at = datetime(\'now\') WHERE race_id = ? AND user_id = ?');
        $stmt->execute(array($raceId, $userId));

        $isWinner = false;

        // Si no hay ganador aún, este usuario es el ganador
        if (empty($race['winner_user_id'])) {
            $stmt = $db->prepare('UPDATE reading_races SET winner_user_id = ? WHERE id = ?');
            $stmt->execute(array($userId, $raceId));

            // Dar XP
            $db->prepare('UPDATE users SET xp = xp + ? WHERE id = ?')->execute(array(100, $userId));

            // Actualizar social_stats
            $db->prepare('INSERT OR IGNORE INTO social_stats (user_id) VALUES (?)')->execute(array($userId));
            $db->prepare('UPDATE social_stats SET races_won = races_won + 1 WHERE user_id = ?')->execute(array($userId));

            $isWinner = true;
        }

        // Verificar si todos terminaron
        $stmt = $db->prepare('SELECT COUNT(*) as total FROM race_participants WHERE race_id = ?');
        $stmt->execute(array($raceId));
        $totalCount = (int)$stmt->fetchColumn();

        $stmt = $db->prepare('SELECT COUNT(*) as finished FROM race_participants WHERE race_id = ? AND finished_at IS NOT NULL');
        $stmt->execute(array($raceId));
        $finishedCount = (int)$stmt->fetchColumn();

        if ($totalCount === $finishedCount) {
            // Todos terminaron, marcar carrera como completada
            $stmt = $db->prepare('UPDATE reading_races SET status = ?, completed_at = datetime(\'now\') WHERE id = ?');
            $stmt->execute(array('completed', $raceId));
        }

        echo json_encode(array('ok' => true, 'is_winner' => $isWinner));
    }

    // POST /api/books/{id}/challenges
    public function createChallenge($params)
    {
        $bookId = $params['id'];
        $userId = $params['user_id'];
        $data = json_decode(file_get_contents('php://input'), true);

        $challengedId = isset($data['challenged_id']) ? (int)$data['challenged_id'] : 0;
        $challengeType = isset($data['challenge_type']) ? trim($data['challenge_type']) : '';
        $targetChapters = isset($data['target_chapters']) ? (int)$data['target_chapters'] : null;
        $targetDays = isset($data['target_days']) ? (int)$data['target_days'] : null;

        if ($challengedId === 0) {
            http_response_code(422);
            echo json_encode(array('error' => 'Destinatario del desafío no especificado'));
            return;
        }

        if (!in_array($challengeType, array('chapters_in_days', 'finish_before'))) {
            http_response_code(422);
            echo json_encode(array('error' => 'Tipo de desafío inválido'));
            return;
        }

        $db = Database::get();

        // Verificar que el libro existe, obtener stored_file_id
        $stmt = $db->prepare('SELECT stored_file_id FROM books WHERE id = ? AND user_id = ?');
        $stmt->execute(array($bookId, $userId));
        $book = $stmt->fetch();

        if (!$book) {
            http_response_code(404);
            echo json_encode(array('error' => 'Libro no encontrado'));
            return;
        }

        if (empty($book['stored_file_id'])) {
            http_response_code(422);
            echo json_encode(array('error' => 'Este libro no tiene un archivo almacenado compartible'));
            return;
        }

        $storedFileId = (int)$book['stored_file_id'];

        // Verificar que el destinatario tiene el mismo stored_file_id (vía shares o propietario)
        $stmt = $db->prepare('SELECT id FROM books WHERE user_id = ? AND stored_file_id = ?');
        $stmt->execute(array($challengedId, $storedFileId));
        $hasBook = $stmt->fetch();

        if (!$hasBook) {
            $stmt = $db->prepare('SELECT id FROM book_shares WHERE stored_file_id = ? AND to_user_id = ? AND status = ?');
            $stmt->execute(array($storedFileId, $challengedId, 'accepted'));
            $hasShare = $stmt->fetch();

            if (!$hasShare) {
                http_response_code(422);
                echo json_encode(array('error' => 'El usuario desafiado no tiene acceso a este libro'));
                return;
            }
        }

        // Calcular deadline
        $deadline = null;
        if ($targetDays !== null) {
            $deadline = date('Y-m-d H:i:s', strtotime('+' . $targetDays . ' days'));
        }

        // Insertar desafío
        $stmt = $db->prepare('
            INSERT INTO reading_challenges (stored_file_id, challenger_id, challenged_id, challenge_type, target_chapters, target_days, deadline)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute(array($storedFileId, $userId, $challengedId, $challengeType, $targetChapters, $targetDays, $deadline));

        // Actualizar social_stats
        $db->prepare('INSERT OR IGNORE INTO social_stats (user_id) VALUES (?)')->execute(array($userId));
        $db->prepare('UPDATE social_stats SET challenges_created = challenges_created + 1 WHERE user_id = ?')->execute(array($userId));

        http_response_code(201);
        echo json_encode(array('ok' => true, 'challenge_id' => (int)$db->lastInsertId()));
    }

    // GET /api/challenges
    public function listChallenges($params)
    {
        $userId = $params['user_id'];
        $db = Database::get();

        // Auto-expirar desafíos vencidos
        $stmt = $db->prepare('UPDATE reading_challenges SET status = ? WHERE status = ? AND deadline IS NOT NULL AND deadline < datetime(\'now\')');
        $stmt->execute(array('expired', 'active'));

        // Obtener desafíos del usuario
        $stmt = $db->prepare('
            SELECT rc.*,
                   u1.username as challenger_username, u1.avatar as challenger_avatar,
                   u2.username as challenged_username, u2.avatar as challenged_avatar
            FROM reading_challenges rc
            JOIN users u1 ON u1.id = rc.challenger_id
            JOIN users u2 ON u2.id = rc.challenged_id
            WHERE rc.challenger_id = ? OR rc.challenged_id = ?
            ORDER BY rc.created_at DESC
        ');
        $stmt->execute(array($userId, $userId));
        $challenges = $stmt->fetchAll();

        foreach ($challenges as &$c) {
            $c['id'] = (int)$c['id'];
            $c['stored_file_id'] = (int)$c['stored_file_id'];
            $c['challenger_id'] = (int)$c['challenger_id'];
            $c['challenged_id'] = (int)$c['challenged_id'];
            $c['target_chapters'] = $c['target_chapters'] !== null ? (int)$c['target_chapters'] : null;
            $c['target_days'] = $c['target_days'] !== null ? (int)$c['target_days'] : null;
            $c['xp_reward'] = (int)$c['xp_reward'];
            $c['winner_user_id'] = $c['winner_user_id'] !== null ? (int)$c['winner_user_id'] : null;
        }
        unset($c);

        echo json_encode($challenges);
    }

    // GET /api/challenges/pending/count
    public function pendingChallengesCount($params)
    {
        $userId = $params['user_id'];
        $db = Database::get();

        $stmt = $db->prepare('SELECT COUNT(*) FROM reading_challenges WHERE challenged_id = ? AND status = ?');
        $stmt->execute(array($userId, 'pending'));
        $count = (int)$stmt->fetchColumn();

        echo json_encode(array('count' => $count));
    }

    // POST /api/challenges/{id}/accept
    public function acceptChallenge($params)
    {
        $challengeId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Verificar que el desafío existe y es para este usuario
        $stmt = $db->prepare('SELECT * FROM reading_challenges WHERE id = ? AND challenged_id = ? AND status = ?');
        $stmt->execute(array($challengeId, $userId, 'pending'));
        $challenge = $stmt->fetch();

        if (!$challenge) {
            http_response_code(404);
            echo json_encode(array('error' => 'Desafío no encontrado'));
            return;
        }

        // Calcular deadline si tiene target_days
        $targetDays = $challenge['target_days'] !== null ? (int)$challenge['target_days'] : null;
        $deadline = null;

        if ($targetDays !== null) {
            $deadline = date('Y-m-d H:i:s', strtotime('+' . $targetDays . ' days'));
        }

        // Actualizar a activo
        $stmt = $db->prepare('UPDATE reading_challenges SET status = ?, started_at = datetime(\'now\'), deadline = ? WHERE id = ?');
        $stmt->execute(array('active', $deadline, $challengeId));

        echo json_encode(array('ok' => true));
    }

    // POST /api/challenges/{id}/reject
    public function rejectChallenge($params)
    {
        $challengeId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Verificar que el desafío existe y es para este usuario
        $stmt = $db->prepare('SELECT id FROM reading_challenges WHERE id = ? AND challenged_id = ? AND status = ?');
        $stmt->execute(array($challengeId, $userId, 'pending'));
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(array('error' => 'Desafío no encontrado'));
            return;
        }

        // Rechazar
        $stmt = $db->prepare('UPDATE reading_challenges SET status = ? WHERE id = ?');
        $stmt->execute(array('rejected', $challengeId));

        echo json_encode(array('ok' => true));
    }

    // GET /api/challenges/{id}/status
    public function challengeStatus($params)
    {
        $challengeId = $params['id'];
        $userId = $params['user_id'];
        $db = Database::get();

        // Obtener el desafío
        $stmt = $db->prepare('SELECT * FROM reading_challenges WHERE id = ?');
        $stmt->execute(array($challengeId));
        $challenge = $stmt->fetch();

        if (!$challenge) {
            http_response_code(404);
            echo json_encode(array('error' => 'Desafío no encontrado'));
            return;
        }

        $challengerId = (int)$challenge['challenger_id'];
        $challengedId = (int)$challenge['challenged_id'];

        // Verificar que el usuario es participante
        if ((int)$userId !== $challengerId && (int)$userId !== $challengedId) {
            http_response_code(403);
            echo json_encode(array('error' => 'No eres participante de este desafío'));
            return;
        }

        $storedFileId = (int)$challenge['stored_file_id'];
        $challengeType = $challenge['challenge_type'];
        $targetChapters = $challenge['target_chapters'] !== null ? (int)$challenge['target_chapters'] : null;
        $status = $challenge['status'];

        // Obtener progreso de ambos usuarios
        $challengerProgress = $this->getChallengeUserProgress($db, $challengerId, $storedFileId);
        $challengedProgress = $this->getChallengeUserProgress($db, $challengedId, $storedFileId);

        // Auto-check completion (solo si está active)
        if ($status === 'active') {
            $winnerId = null;

            if ($challengeType === 'chapters_in_days' && $targetChapters !== null) {
                if ($challengerProgress['current_chapter'] >= $targetChapters) {
                    $winnerId = $challengerId;
                } elseif ($challengedProgress['current_chapter'] >= $targetChapters) {
                    $winnerId = $challengedId;
                }
            } elseif ($challengeType === 'finish_before') {
                if ($challengerProgress['progress_percent'] >= 100) {
                    $winnerId = $challengerId;
                } elseif ($challengedProgress['progress_percent'] >= 100) {
                    $winnerId = $challengedId;
                }
            }

            // Si hay ganador, marcar como completado
            if ($winnerId !== null) {
                $xpReward = (int)$challenge['xp_reward'];
                $stmt = $db->prepare('UPDATE reading_challenges SET status = ?, winner_user_id = ?, completed_at = datetime(\'now\') WHERE id = ?');
                $stmt->execute(array('completed', $winnerId, $challengeId));

                // Dar XP
                $db->prepare('UPDATE users SET xp = xp + ? WHERE id = ?')->execute(array($xpReward, $winnerId));

                // Actualizar social_stats
                $db->prepare('INSERT OR IGNORE INTO social_stats (user_id) VALUES (?)')->execute(array($winnerId));
                $db->prepare('UPDATE social_stats SET challenges_completed = challenges_completed + 1 WHERE user_id = ?')->execute(array($winnerId));

                $challenge['status'] = 'completed';
                $challenge['winner_user_id'] = $winnerId;
            }

            // Verificar expiración
            if ($challenge['deadline'] !== null && $challenge['deadline'] < date('Y-m-d H:i:s')) {
                $stmt = $db->prepare('UPDATE reading_challenges SET status = ? WHERE id = ?');
                $stmt->execute(array('expired', $challengeId));
                $challenge['status'] = 'expired';
            }
        }

        echo json_encode(array(
            'challenge' => array(
                'id' => (int)$challenge['id'],
                'stored_file_id' => $storedFileId,
                'challenger_id' => $challengerId,
                'challenged_id' => $challengedId,
                'challenge_type' => $challengeType,
                'target_chapters' => $targetChapters,
                'target_days' => $challenge['target_days'] !== null ? (int)$challenge['target_days'] : null,
                'deadline' => $challenge['deadline'],
                'status' => $challenge['status'],
                'xp_reward' => (int)$challenge['xp_reward'],
                'winner_user_id' => $challenge['winner_user_id'] !== null ? (int)$challenge['winner_user_id'] : null,
                'created_at' => $challenge['created_at'],
                'started_at' => $challenge['started_at'],
                'completed_at' => $challenge['completed_at']
            ),
            'challenger_progress' => $challengerProgress,
            'challenged_progress' => $challengedProgress
        ));
    }

    // Helper function para obtener progreso de usuario en desafío
    private function getChallengeUserProgress($db, $userId, $storedFileId)
    {
        $progress = array(
            'user_id' => (int)$userId,
            'progress_percent' => 0,
            'current_chapter' => 0,
            'current_page' => 0,
            'last_read' => null
        );

        // Buscar book_id del usuario para este stored_file_id
        $stmt = $db->prepare('SELECT id FROM books WHERE user_id = ? AND stored_file_id = ?');
        $stmt->execute(array($userId, $storedFileId));
        $book = $stmt->fetch();

        if ($book) {
            $bookId = (int)$book['id'];
            $stmt = $db->prepare('SELECT progress_percent, current_chapter, current_page, last_read FROM reading_progress WHERE book_id = ? AND user_id = ?');
            $stmt->execute(array($bookId, $userId));
            $rp = $stmt->fetch();

            if ($rp) {
                $progress['progress_percent'] = (int)$rp['progress_percent'];
                $progress['current_chapter'] = (int)$rp['current_chapter'];
                $progress['current_page'] = (int)$rp['current_page'];
                $progress['last_read'] = $rp['last_read'];
            }
        }

        return $progress;
    }
}
