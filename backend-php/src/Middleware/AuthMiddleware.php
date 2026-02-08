<?php
namespace KlioReader\Middleware;

use KlioReader\Auth\JwtHandler;

class AuthMiddleware
{
    public static function wrap(array $handler): \Closure
    {
        return function (array $params = []) use ($handler) {
            $userId = self::authenticate();
            if ($userId === null) {
                http_response_code(401);
                echo json_encode(['error' => 'Token inválido o expirado']);
                return;
            }

            $params['user_id'] = $userId;
            $instance = new $handler[0]();
            call_user_func([$instance, $handler[1]], $params);
        };
    }

    private static function authenticate(): ?int
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
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
