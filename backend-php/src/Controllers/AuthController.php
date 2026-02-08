<?php
namespace KlioReader\Controllers;

use KlioReader\Config\Database;
use KlioReader\Auth\JwtHandler;

class AuthController
{
    public function register(array $params = []): void
    {
        $data = json_decode(file_get_contents('php://input'), true);

        $username = trim($data['username'] ?? '');
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        if (strlen($username) < 3 || strlen($password) < 6 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(422);
            echo json_encode(['error' => 'Username (min 3), email válido y password (min 6) requeridos']);
            return;
        }

        $db = Database::get();

        $stmt = $db->prepare('SELECT id FROM users WHERE email = ? OR username = ?');
        $stmt->execute([$email, $username]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'El usuario o email ya existe']);
            return;
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $db->prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
        $stmt->execute([$username, $email, $hash]);

        $userId = (int)$db->lastInsertId();
        $token = JwtHandler::encode(['user_id' => $userId]);

        http_response_code(201);
        echo json_encode([
            'token' => $token,
            'user' => [
                'id' => $userId,
                'username' => $username,
                'email' => $email,
            ],
        ]);
    }

    public function login(array $params = []): void
    {
        $data = json_decode(file_get_contents('php://input'), true);

        $login = trim($data['login'] ?? ''); // email or username
        $password = $data['password'] ?? '';

        if (!$login || !$password) {
            http_response_code(422);
            echo json_encode(['error' => 'Login y password requeridos']);
            return;
        }

        $db = Database::get();
        $stmt = $db->prepare('SELECT * FROM users WHERE email = ? OR username = ?');
        $stmt->execute([$login, $login]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Credenciales incorrectas']);
            return;
        }

        $token = JwtHandler::encode(['user_id' => (int)$user['id']]);

        echo json_encode([
            'token' => $token,
            'user' => [
                'id' => (int)$user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'xp' => (int)$user['xp'],
                'level' => (int)$user['level'],
                'streak' => (int)$user['streak'],
            ],
        ]);
    }
}
