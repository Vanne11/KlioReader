<?php
require_once __DIR__ . '/../vendor/autoload.php';

// Load .env
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#')) continue;
        if (!str_contains($line, '=')) continue;
        putenv(trim($line));
        [$key, $val] = explode('=', $line, 2);
        $_ENV[trim($key)] = trim($val);
    }
}

// CORS
$allowedOrigins = explode(',', $_ENV['ALLOWED_ORIGINS'] ?? '*');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins) || in_array('*', $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

use KlioReader\Router;
use KlioReader\Controllers\AuthController;
use KlioReader\Controllers\BookController;
use KlioReader\Controllers\UserController;
use KlioReader\Middleware\AuthMiddleware;

$router = new Router();

// ── Health check ──
$router->get('/', function () { echo json_encode(['status' => 'ok', 'api' => 'KlioReader3']); });

// ── Auth (público) ──
$router->post('/api/auth/register', [AuthController::class, 'register']);
$router->post('/api/auth/login', [AuthController::class, 'login']);

// ── Usuario (protegido) ──
$router->get('/api/user/profile', AuthMiddleware::wrap([UserController::class, 'profile']));
$router->put('/api/user/profile', AuthMiddleware::wrap([UserController::class, 'updateProfile']));
$router->get('/api/user/stats', AuthMiddleware::wrap([UserController::class, 'stats']));
$router->put('/api/user/stats', AuthMiddleware::wrap([UserController::class, 'updateStats']));
$router->delete('/api/user/delete', AuthMiddleware::wrap([UserController::class, 'delete']));

// ── Libros (protegido) ──
$router->get('/api/books', AuthMiddleware::wrap([BookController::class, 'list']));
$router->post('/api/books/upload', AuthMiddleware::wrap([BookController::class, 'upload']));
$router->get('/api/books/{id}', AuthMiddleware::wrap([BookController::class, 'get']));
$router->put('/api/books/{id}', AuthMiddleware::wrap([BookController::class, 'update']));
$router->get('/api/books/{id}/download', AuthMiddleware::wrap([BookController::class, 'download']));
$router->delete('/api/books/{id}', AuthMiddleware::wrap([BookController::class, 'delete']));

// ── Progreso de lectura (protegido) ──
$router->get('/api/books/{id}/progress', AuthMiddleware::wrap([BookController::class, 'getProgress']));
$router->put('/api/books/{id}/progress', AuthMiddleware::wrap([BookController::class, 'updateProgress']));

// ── Notas (protegido) ──
$router->get('/api/books/{id}/notes', AuthMiddleware::wrap([BookController::class, 'getNotes']));
$router->post('/api/books/{id}/notes', AuthMiddleware::wrap([BookController::class, 'addNote']));
$router->delete('/api/notes/{id}', AuthMiddleware::wrap([BookController::class, 'deleteNote']));

// ── Marcadores (protegido) ──
$router->get('/api/books/{id}/bookmarks', AuthMiddleware::wrap([BookController::class, 'getBookmarks']));
$router->post('/api/books/{id}/bookmarks', AuthMiddleware::wrap([BookController::class, 'addBookmark']));
$router->delete('/api/bookmarks/{id}', AuthMiddleware::wrap([BookController::class, 'deleteBookmark']));

$router->resolve();
