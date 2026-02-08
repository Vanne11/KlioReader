<?php

class AuthController
{
    public function register($params = array())
    {
        $data = json_decode(file_get_contents('php://input'), true);

        $username = trim(isset($data['username']) ? $data['username'] : '');
        $email = trim(isset($data['email']) ? $data['email'] : '');
        $password = isset($data['password']) ? $data['password'] : '';

        if (strlen($username) < 3 || strlen($password) < 6 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(422);
            echo json_encode(array('error' => 'Username (min 3), email valido y password (min 6) requeridos'));
            return;
        }

        $db = Database::get();

        $stmt = $db->prepare('SELECT id FROM users WHERE email = ? OR username = ?');
        $stmt->execute(array($email, $username));
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(array('error' => 'El usuario o email ya existe'));
            return;
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $db->prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
        $stmt->execute(array($username, $email, $hash));

        $userId = (int)$db->lastInsertId();
        $token = JwtHandler::encode(array('user_id' => $userId));

        http_response_code(201);
        echo json_encode(array(
            'token' => $token,
            'user' => array(
                'id' => $userId,
                'username' => $username,
                'email' => $email,
            ),
        ));
    }

    public function login($params = array())
    {
        $data = json_decode(file_get_contents('php://input'), true);

        $login = trim(isset($data['login']) ? $data['login'] : '');
        $password = isset($data['password']) ? $data['password'] : '';

        if (!$login || !$password) {
            http_response_code(422);
            echo json_encode(array('error' => 'Login y password requeridos'));
            return;
        }

        $db = Database::get();
        $stmt = $db->prepare('SELECT * FROM users WHERE email = ? OR username = ?');
        $stmt->execute(array($login, $login));
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            http_response_code(401);
            echo json_encode(array('error' => 'Credenciales incorrectas'));
            return;
        }

        $token = JwtHandler::encode(array('user_id' => (int)$user['id']));

        echo json_encode(array(
            'token' => $token,
            'user' => array(
                'id' => (int)$user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'xp' => (int)$user['xp'],
                'level' => (int)$user['level'],
                'streak' => (int)$user['streak'],
            ),
        ));
    }
}
