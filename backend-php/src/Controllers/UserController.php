<?php

class UserController
{
    // GET /api/user/profile
    public function profile($params)
    {
        $db = Database::get();
        $stmt = $db->prepare('SELECT id, username, email, avatar, xp, level, streak, last_streak_date, selected_title_id, storage_used, upload_limit, is_subscriber, created_at FROM users WHERE id = ?');
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

        // Cast integer fields (PDO/SQLite returns strings)
        $user['id'] = (int)$user['id'];
        $user['xp'] = (int)$user['xp'];
        $user['level'] = (int)$user['level'];
        $user['streak'] = (int)$user['streak'];
        $user['total_books'] = (int)$bookCount['total_books'];
        $user['total_notes'] = (int)$noteCount['total_notes'];
        $user['total_bookmarks'] = (int)$bookmarkCount['total_bookmarks'];
        $user['storage_used'] = (int)$user['storage_used'];
        $user['upload_limit'] = (int)$user['upload_limit'];
        $user['is_subscriber'] = (int)$user['is_subscriber'];

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
        if (array_key_exists('selected_title_id', $data)) {
            $fields[] = 'selected_title_id = ?';
            $values[] = $data['selected_title_id'];
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
        $stmt = $db->prepare('SELECT xp, level, streak, last_streak_date, selected_title_id FROM users WHERE id = ?');
        $stmt->execute(array($params['user_id']));
        $row = $stmt->fetch();
        if ($row) {
            $row['xp'] = (int)$row['xp'];
            $row['level'] = (int)$row['level'];
            $row['streak'] = (int)$row['streak'];
        }
        echo json_encode($row);
    }

    // DELETE /api/user/delete
    public function delete($params)
    {
        $db = Database::get();
        $userId = $params['user_id'];

        // Eliminar archivos de cada proveedor antes del cascade delete
        $stmt = $db->prepare('SELECT file_path, storage_type, storage_file_id FROM books WHERE user_id = ?');
        $stmt->execute(array($userId));
        $books = $stmt->fetchAll();

        $sm = StorageManager::getInstance();
        foreach ($books as $book) {
            $storageType = isset($book['storage_type']) ? $book['storage_type'] : 'local';
            $remoteName = $userId . '/' . $book['file_path'];
            if ($storageType === 'local') {
                $fullPath = dirname(__DIR__, 2) . '/uploads/' . $remoteName;
                if (file_exists($fullPath)) @unlink($fullPath);
            } else {
                $driver = $sm->getDriver($storageType);
                $driver->delete($remoteName, $book['storage_file_id']);
            }
        }

        // Cascade deletes books, notes, bookmarks, progress
        $stmt = $db->prepare('DELETE FROM users WHERE id = ?');
        $stmt->execute(array($userId));

        // Limpiar directorio local del usuario (por si quedan archivos)
        $uploadsDir = dirname(__DIR__, 2) . '/uploads/' . $userId;
        if (is_dir($uploadsDir)) {
            $files = glob($uploadsDir . '/*');
            if ($files) array_map('unlink', $files);
            @rmdir($uploadsDir);
        }

        // Limpiar progress_archive del usuario
        $db->prepare('DELETE FROM progress_archive WHERE user_id = ?')->execute(array($userId));

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
