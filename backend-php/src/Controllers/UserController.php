<?php

class UserController
{
    // GET /api/user/profile
    public function profile($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT id, username, email, avatar, xp, level, streak, last_streak_date, created_at FROM users WHERE id = ?');
        $stmt->execute(array($params['user_id']));
        $user = $stmt->fetch();

        if (!$user) {
            http_response_code(404);
            echo json_encode(array('error' => 'Usuario no encontrado'));
            return;
        }

        // Stats
        $stmt = $db->prepare('SELECT COUNT(*) as total_books FROM books WHERE user_id = ?');
        $stmt->execute(array($params['user_id']));
        $bookCount = $stmt->fetch();

        $stmt = $db->prepare('SELECT COUNT(*) as total_notes FROM notes WHERE user_id = ?');
        $stmt->execute(array($params['user_id']));
        $noteCount = $stmt->fetch();

        $stmt = $db->prepare('SELECT COUNT(*) as total_bookmarks FROM bookmarks WHERE user_id = ?');
        $stmt->execute(array($params['user_id']));
        $bookmarkCount = $stmt->fetch();

        $user['total_books'] = (int)$bookCount['total_books'];
        $user['total_notes'] = (int)$noteCount['total_notes'];
        $user['total_bookmarks'] = (int)$bookmarkCount['total_bookmarks'];

        echo json_encode($user);
    }

    // PUT /api/user/profile
    public function updateProfile($params)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $db = Database::get();

        $fields = array();
        $values = array();

        if (isset($data['username'])) {
            $fields[] = 'username = ?';
            $values[] = trim($data['username']);
        }
        if (isset($data['email'])) {
            $fields[] = 'email = ?';
            $values[] = trim($data['email']);
        }
        if (isset($data['avatar'])) {
            $fields[] = 'avatar = ?';
            $values[] = $data['avatar'];
        }
        if (isset($data['password'])) {
            $fields[] = 'password_hash = ?';
            $values[] = password_hash($data['password'], PASSWORD_BCRYPT);
        }

        if (empty($fields)) {
            http_response_code(422);
            echo json_encode(array('error' => 'No hay campos para actualizar'));
            return;
        }

        $values[] = $params['user_id'];
        $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?';

        try {
            $db->prepare($sql)->execute($values);
            echo json_encode(array('ok' => true));
        } catch (PDOException $e) {
            http_response_code(409);
            echo json_encode(array('error' => 'El username o email ya esta en uso'));
        }
    }

    // GET /api/user/stats
    public function stats($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT xp, level, streak, last_streak_date FROM users WHERE id = ?');
        $stmt->execute(array($params['user_id']));
        echo json_encode($stmt->fetch());
    }

    // DELETE /api/user/delete
    public function delete($params)
    {
        $db = Database::get();
        // Cascade deletes books, notes, bookmarks, progress
        $stmt = $db->prepare('DELETE FROM users WHERE id = ?');
        $stmt->execute(array($params['user_id']));

        // Clean uploaded files
        $uploadsDir = dirname(__DIR__, 2) . '/uploads/' . $params['user_id'];
        if (is_dir($uploadsDir)) {
            array_map('unlink', glob($uploadsDir . '/*'));
            rmdir($uploadsDir);
        }

        echo json_encode(array('ok' => true));
    }

    // PUT /api/user/stats
    public function updateStats($params)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $db = Database::get();

        $stmt = $db->prepare('UPDATE users SET xp = ?, level = ?, streak = ?, last_streak_date = ? WHERE id = ?');
        $stmt->execute(array(
            (int)(isset($data['xp']) ? $data['xp'] : 0),
            (int)(isset($data['level']) ? $data['level'] : 1),
            (int)(isset($data['streak']) ? $data['streak'] : 0),
            isset($data['last_streak_date']) ? $data['last_streak_date'] : null,
            $params['user_id'],
        ));

        echo json_encode(array('ok' => true));
    }
}
