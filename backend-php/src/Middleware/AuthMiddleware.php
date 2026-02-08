<?php

class AuthMiddleware
{
    public static function wrap($handler)
    {
        return function ($params = array()) use ($handler) {
            $userId = self::authenticate();
            if ($userId === null) {
                http_response_code(401);
                echo json_encode(array('error' => 'Token invalido o expirado'));
                return;
            }

            $params['user_id'] = $userId;
            $instance = new $handler[0]();
            call_user_func(array($instance, $handler[1]), $params);
        };
    }

    private static function authenticate()
    {
        $header = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
        if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
            return null;
        }

        $payload = JwtHandler::decode($m[1]);
        if (!$payload || !isset($payload['user_id'])) {
            return null;
        }

        return (int)$payload['user_id'];
    }
}
