<?php

function db() {
    static $pdo = null;
    if ($pdo === null) {
        $dbPath = dirname(__DIR__) . '/data/klioreader.db';
        $pdo = new PDO('sqlite:' . $dbPath, null, null, array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ));
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');
    }
    return $pdo;
}

function csrf_token() {
    if (session_status() === PHP_SESSION_NONE) session_start();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_field() {
    return '<input type="hidden" name="_csrf" value="' . htmlspecialchars(csrf_token()) . '">';
}

function verify_csrf() {
    if (session_status() === PHP_SESSION_NONE) session_start();
    $token = isset($_POST['_csrf']) ? $_POST['_csrf'] : '';
    if (!$token || !isset($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $token)) {
        http_response_code(403);
        die('Token CSRF invalido.');
    }
}

function flash($key, $value = null) {
    if (session_status() === PHP_SESSION_NONE) session_start();
    if ($value !== null) {
        $_SESSION['flash_' . $key] = $value;
        return null;
    }
    $val = isset($_SESSION['flash_' . $key]) ? $_SESSION['flash_' . $key] : null;
    unset($_SESSION['flash_' . $key]);
    return $val;
}

function format_bytes($bytes, $decimals = 1) {
    if ($bytes == 0) return '0 B';
    $k = 1024;
    $sizes = array('B', 'KB', 'MB', 'GB', 'TB');
    $i = floor(log($bytes) / log($k));
    return round($bytes / pow($k, $i), $decimals) . ' ' . $sizes[$i];
}

function redirect($url) {
    header('Location: ' . $url);
    exit;
}

function is_admin_logged_in() {
    if (session_status() === PHP_SESSION_NONE) session_start();
    return !empty($_SESSION['admin_id']);
}

function get_setting($key, $default = '') {
    try {
        $stmt = db()->prepare('SELECT value FROM site_settings WHERE key = ?');
        $stmt->execute(array($key));
        $row = $stmt->fetch();
        return $row ? $row['value'] : $default;
    } catch (Exception $e) {
        return $default;
    }
}

function e($str) {
    return htmlspecialchars($str, ENT_QUOTES, 'UTF-8');
}

function current_lang() {
    static $lang = null;
    if ($lang !== null) return $lang;
    $supported = array('es', 'en');
    if (isset($_GET['lang']) && in_array($_GET['lang'], $supported)) {
        $lang = $_GET['lang'];
        setcookie('klio_lang', $lang, time() + 86400 * 365, '/');
        return $lang;
    }
    if (isset($_COOKIE['klio_lang']) && in_array($_COOKIE['klio_lang'], $supported)) {
        $lang = $_COOKIE['klio_lang'];
        return $lang;
    }
    $lang = 'en';
    return $lang;
}

function t($key) {
    static $strings = null;
    if ($strings === null) {
        $lang = current_lang();
        $file = dirname(__DIR__) . '/lang/' . $lang . '.json';
        if (!file_exists($file)) {
            $file = dirname(__DIR__) . '/lang/en.json';
        }
        if (file_exists($file)) {
            $strings = json_decode(file_get_contents($file), true);
        }
        if (!$strings) $strings = array();
    }
    return isset($strings[$key]) ? $strings[$key] : $key;
}

function base_url($path = '') {
    static $base = null;
    if ($base === null) {
        $projectRoot = realpath(dirname(__DIR__));
        $docRoot = realpath($_SERVER['DOCUMENT_ROOT']);
        if ($projectRoot && $docRoot && strpos($projectRoot, $docRoot) === 0) {
            $base = str_replace('\\', '/', substr($projectRoot, strlen($docRoot)));
        } else {
            $base = '';
        }
        $base = rtrim($base, '/');
    }
    if ($path === '') return $base . '/';
    return $base . '/' . ltrim($path, '/');
}
