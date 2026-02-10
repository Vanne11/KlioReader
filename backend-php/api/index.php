<?php
require_once __DIR__ . '/../src/Config/Database.php';
require_once __DIR__ . '/../src/Auth/JwtHandler.php';
require_once __DIR__ . '/../src/Router.php';
require_once __DIR__ . '/../src/Middleware/AuthMiddleware.php';
require_once __DIR__ . '/../src/Controllers/AuthController.php';
require_once __DIR__ . '/../src/Controllers/BookController.php';
require_once __DIR__ . '/../src/Controllers/UserController.php';
require_once __DIR__ . '/../src/Controllers/ShareController.php';
require_once __DIR__ . '/../src/Controllers/CollectionController.php';
require_once __DIR__ . '/../src/Storage/StorageDriver.php';
require_once __DIR__ . '/../src/Storage/LocalDriver.php';
require_once __DIR__ . '/../src/Storage/B2Driver.php';
require_once __DIR__ . '/../src/Storage/S3Driver.php';
require_once __DIR__ . '/../src/Storage/GCSDriver.php';
require_once __DIR__ . '/../src/Storage/GoogleDriveDriver.php';
require_once __DIR__ . '/../src/Storage/StorageManager.php';

// Load .env
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $trimmed = trim($line);
        if (substr($trimmed, 0, 1) === '#') continue;
        if (strpos($line, '=') === false) continue;
        putenv(trim($line));
        $parts = explode('=', $line, 2);
        $_ENV[trim($parts[0])] = trim($parts[1]);
    }
}

// CORS
$allowedOrigins = explode(',', isset($_ENV['ALLOWED_ORIGINS']) ? $_ENV['ALLOWED_ORIGINS'] : '*');
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if (in_array($origin, $allowedOrigins) || in_array('*', $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . ($origin ? $origin : '*'));
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$router = new Router();

// -- Health check --
$router->get('/', function () { echo json_encode(array('status' => 'ok', 'api' => 'KlioReader3')); });

// -- Auth (publico) --
$router->post('/auth/register', array('AuthController', 'register'));
$router->post('/auth/login', array('AuthController', 'login'));

// -- Usuario (protegido) --
$router->get('/user/profile', AuthMiddleware::wrap(array('UserController', 'profile')));
$router->put('/user/profile', AuthMiddleware::wrap(array('UserController', 'updateProfile')));
$router->get('/user/stats', AuthMiddleware::wrap(array('UserController', 'stats')));
$router->put('/user/stats', AuthMiddleware::wrap(array('UserController', 'updateStats')));
$router->delete('/user/delete', AuthMiddleware::wrap(array('UserController', 'delete')));

// -- Libros (protegido) --
$router->get('/books/digest', AuthMiddleware::wrap(array('BookController', 'digest')));
$router->get('/books', AuthMiddleware::wrap(array('BookController', 'listBooks')));
$router->post('/books/covers', AuthMiddleware::wrap(array('BookController', 'covers')));
$router->post('/books/check-hash', AuthMiddleware::wrap(array('BookController', 'checkHash')));
$router->post('/books/upload', AuthMiddleware::wrap(array('BookController', 'upload')));
$router->post('/books/remove-duplicates', AuthMiddleware::wrap(array('BookController', 'removeDuplicates')));
$router->get('/books/{id}', AuthMiddleware::wrap(array('BookController', 'get')));
$router->put('/books/{id}', AuthMiddleware::wrap(array('BookController', 'update')));
$router->get('/books/{id}/download', AuthMiddleware::wrap(array('BookController', 'download')));
$router->delete('/books/{id}', AuthMiddleware::wrap(array('BookController', 'deleteBook')));

// -- Progreso de lectura (protegido) --
$router->get('/books/{id}/progress', AuthMiddleware::wrap(array('BookController', 'getProgress')));
$router->put('/books/{id}/progress', AuthMiddleware::wrap(array('BookController', 'updateProgress')));

// -- Notas (protegido) --
$router->get('/books/{id}/notes', AuthMiddleware::wrap(array('BookController', 'getNotes')));
$router->post('/books/{id}/notes', AuthMiddleware::wrap(array('BookController', 'addNote')));
$router->delete('/notes/{id}', AuthMiddleware::wrap(array('BookController', 'deleteNote')));

// -- Marcadores (protegido) --
$router->get('/books/{id}/bookmarks', AuthMiddleware::wrap(array('BookController', 'getBookmarks')));
$router->post('/books/{id}/bookmarks', AuthMiddleware::wrap(array('BookController', 'addBookmark')));
$router->delete('/bookmarks/{id}', AuthMiddleware::wrap(array('BookController', 'deleteBookmark')));

// -- Compartir libros (protegido) --
$router->get('/users/search', AuthMiddleware::wrap(array('ShareController', 'searchUsers')));
$router->post('/books/{id}/share', AuthMiddleware::wrap(array('ShareController', 'shareBook')));
$router->get('/shares/pending', AuthMiddleware::wrap(array('ShareController', 'pendingShares')));
$router->get('/shares/pending/count', AuthMiddleware::wrap(array('ShareController', 'pendingCount')));
$router->post('/shares/{id}/accept', AuthMiddleware::wrap(array('ShareController', 'acceptShare')));
$router->post('/shares/{id}/reject', AuthMiddleware::wrap(array('ShareController', 'rejectShare')));
$router->get('/books/{id}/shared-progress', AuthMiddleware::wrap(array('ShareController', 'sharedProgress')));
$router->get('/shared-progress/batch', AuthMiddleware::wrap(array('ShareController', 'batchSharedProgress')));

// -- Carreras de lectura (protegido) --
$router->post('/books/{id}/races', AuthMiddleware::wrap(array('ShareController', 'createRace')));
$router->post('/races/{id}/join', AuthMiddleware::wrap(array('ShareController', 'joinRace')));
$router->get('/races/{id}/leaderboard', AuthMiddleware::wrap(array('ShareController', 'raceLeaderboard')));
$router->post('/races/{id}/finish', AuthMiddleware::wrap(array('ShareController', 'finishRace')));

// -- Retos entre amigos (protegido) --
$router->post('/books/{id}/challenges', AuthMiddleware::wrap(array('ShareController', 'createChallenge')));
$router->get('/challenges', AuthMiddleware::wrap(array('ShareController', 'listChallenges')));
$router->get('/challenges/pending/count', AuthMiddleware::wrap(array('ShareController', 'pendingChallengesCount')));
$router->post('/challenges/{id}/accept', AuthMiddleware::wrap(array('ShareController', 'acceptChallenge')));
$router->post('/challenges/{id}/reject', AuthMiddleware::wrap(array('ShareController', 'rejectChallenge')));
$router->get('/challenges/{id}/status', AuthMiddleware::wrap(array('ShareController', 'challengeStatus')));

// -- Notas compartidas y de voz (protegido) --
$router->put('/notes/{id}/share', AuthMiddleware::wrap(array('BookController', 'toggleNoteShared')));
$router->get('/books/{id}/shared-notes', AuthMiddleware::wrap(array('BookController', 'getSharedNotes')));
$router->post('/books/{id}/voice-notes', AuthMiddleware::wrap(array('BookController', 'uploadVoiceNote')));
$router->get('/voice-notes/{id}/audio', AuthMiddleware::wrap(array('BookController', 'streamVoiceAudio')));
$router->delete('/voice-notes/{id}', AuthMiddleware::wrap(array('BookController', 'deleteVoiceNote')));

// -- Social stats (protegido) --
$router->get('/user/social-stats', AuthMiddleware::wrap(array('UserController', 'socialStats')));

// -- Colecciones (protegido) --
$router->get('/collections', AuthMiddleware::wrap(array('CollectionController', 'listCollections')));
$router->post('/collections', AuthMiddleware::wrap(array('CollectionController', 'create')));
$router->get('/collections/{id}', AuthMiddleware::wrap(array('CollectionController', 'get')));
$router->put('/collections/{id}', AuthMiddleware::wrap(array('CollectionController', 'update')));
$router->delete('/collections/{id}', AuthMiddleware::wrap(array('CollectionController', 'delete')));
$router->post('/collections/{id}/books', AuthMiddleware::wrap(array('CollectionController', 'addBooks')));
$router->delete('/collections/{id}/books/{bookId}', AuthMiddleware::wrap(array('CollectionController', 'removeBook')));
$router->put('/collections/{id}/reorder', AuthMiddleware::wrap(array('CollectionController', 'reorder')));
$router->post('/collections/{id}/share', AuthMiddleware::wrap(array('CollectionController', 'share')));

// -- Compartir colecciones (protegido) --
$router->get('/collection-shares/pending', AuthMiddleware::wrap(array('CollectionController', 'pendingShares')));
$router->get('/collection-shares/pending/count', AuthMiddleware::wrap(array('CollectionController', 'pendingCount')));
$router->post('/collection-shares/{id}/accept', AuthMiddleware::wrap(array('CollectionController', 'acceptShare')));
$router->post('/collection-shares/{id}/reject', AuthMiddleware::wrap(array('CollectionController', 'rejectShare')));

$router->resolve();
