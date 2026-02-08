<?php

class Database
{
    private static $instance = null;

    public static function get()
    {
        if (self::$instance === null) {
            $dbPath = isset($_ENV['DB_PATH']) ? $_ENV['DB_PATH'] : 'data/klioreader.db';

            // Si es ruta relativa, resolver desde la raiz del backend
            if ($dbPath[0] !== '/') {
                $dbPath = dirname(__DIR__, 2) . '/' . $dbPath;
            }

            try {
                self::$instance = new PDO(
                    'sqlite:' . $dbPath,
                    null,
                    null,
                    array(
                        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                        PDO::ATTR_EMULATE_PREPARES => false,
                    )
                );
                self::$instance->exec('PRAGMA foreign_keys = ON');
                self::$instance->exec('PRAGMA journal_mode = WAL');
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(array('error' => 'Database connection failed'));
                exit;
            }
        }
        return self::$instance;
    }
}
