<?php

class JwtHandler
{
    private static function secret()
    {
        return isset($_ENV['JWT_SECRET']) ? $_ENV['JWT_SECRET'] : 'default_secret_change_me';
    }

    private static function expiry()
    {
        return (int)(isset($_ENV['JWT_EXPIRY']) ? $_ENV['JWT_EXPIRY'] : 86400);
    }

    public static function encode($payload)
    {
        $now = time();
        $payload['iat'] = $now;
        $payload['exp'] = $now + self::expiry();

        $header = self::base64UrlEncode(json_encode(array('typ' => 'JWT', 'alg' => 'HS256')));
        $body = self::base64UrlEncode(json_encode($payload));
        $signature = self::base64UrlEncode(
            hash_hmac('sha256', $header . '.' . $body, self::secret(), true)
        );

        return $header . '.' . $body . '.' . $signature;
    }

    public static function decode($token)
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        list($header64, $body64, $sig64) = $parts;

        // Verificar firma
        $expectedSig = self::base64UrlEncode(
            hash_hmac('sha256', $header64 . '.' . $body64, self::secret(), true)
        );

        if (!self::hashEquals($expectedSig, $sig64)) {
            return null;
        }

        $payload = json_decode(self::base64UrlDecode($body64), true);
        if (!$payload) {
            return null;
        }

        // Verificar expiracion
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return null;
        }

        return $payload;
    }

    private static function base64UrlEncode($data)
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode($data)
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }

    private static function hashEquals($known, $user)
    {
        if (function_exists('hash_equals')) {
            return hash_equals($known, $user);
        }
        // Fallback para PHP < 5.6 (comparacion en tiempo constante)
        if (strlen($known) !== strlen($user)) {
            return false;
        }
        $result = 0;
        for ($i = 0; $i < strlen($known); $i++) {
            $result |= ord($known[$i]) ^ ord($user[$i]);
        }
        return $result === 0;
    }
}
