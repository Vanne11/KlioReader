<?php
namespace KlioReader\Auth;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class JwtHandler
{
    private static function secret(): string
    {
        return $_ENV['JWT_SECRET'] ?? 'default_secret_change_me';
    }

    private static function expiry(): int
    {
        return (int)($_ENV['JWT_EXPIRY'] ?? 86400);
    }

    public static function encode(array $payload): string
    {
        $now = time();
        $token = array_merge($payload, [
            'iat' => $now,
            'exp' => $now + self::expiry(),
        ]);
        return JWT::encode($token, self::secret(), 'HS256');
    }

    public static function decode(string $token): ?array
    {
        try {
            $decoded = JWT::decode($token, new Key(self::secret(), 'HS256'));
            return (array)$decoded;
        } catch (\Exception $e) {
            return null;
        }
    }
}
