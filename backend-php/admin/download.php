<?php
require_once __DIR__ . '/../templates/functions.php';
require_once __DIR__ . '/../templates/admin-guard.php';
require_once __DIR__ . '/../src/Config/Database.php';
require_once __DIR__ . '/../src/Storage/StorageDriver.php';
require_once __DIR__ . '/../src/Storage/LocalDriver.php';
require_once __DIR__ . '/../src/Storage/B2Driver.php';
require_once __DIR__ . '/../src/Storage/S3Driver.php';
require_once __DIR__ . '/../src/Storage/GCSDriver.php';
require_once __DIR__ . '/../src/Storage/GoogleDriveDriver.php';
require_once __DIR__ . '/../src/Storage/StorageManager.php';

$bookId = (int)(isset($_GET['id']) ? $_GET['id'] : 0);
if (!$bookId) {
    http_response_code(400);
    die('ID de libro requerido.');
}

$db = Database::get();
$stmt = $db->prepare('
    SELECT b.file_name, b.file_type, b.stored_file_id,
           b.file_path AS b_file_path, b.storage_type AS b_storage_type, b.storage_file_id AS b_storage_file_id,
           sf.storage_path AS sf_storage_path, sf.storage_type AS sf_storage_type, sf.storage_file_id AS sf_storage_file_id
    FROM books b
    LEFT JOIN stored_files sf ON sf.id = b.stored_file_id
    WHERE b.id = ?
');
$stmt->execute(array($bookId));
$book = $stmt->fetch();

if (!$book) {
    http_response_code(404);
    die('Libro no encontrado.');
}

$mime = $book['file_type'] === 'pdf' ? 'application/pdf' : 'application/epub+zip';

// Priorizar stored_files si existe, fallback a campos legacy de books
if (!empty($book['stored_file_id']) && !empty($book['sf_storage_path'])) {
    $storagePath = $book['sf_storage_path'];
    $storageType = $book['sf_storage_type'];
    $storageFileId = $book['sf_storage_file_id'];
} else {
    // Legacy: buscar user_id para construir la ruta
    $stmtUser = $db->prepare('SELECT user_id FROM books WHERE id = ?');
    $stmtUser->execute(array($bookId));
    $userId = $stmtUser->fetchColumn();
    $storagePath = $userId . '/' . $book['b_file_path'];
    $storageType = isset($book['b_storage_type']) ? $book['b_storage_type'] : 'local';
    $storageFileId = $book['b_storage_file_id'];
}

if ($storageType === 'local') {
    $uploadsDir = dirname(__DIR__) . '/uploads';
    $fullPath = $uploadsDir . '/' . $storagePath;
    if (!file_exists($fullPath)) {
        http_response_code(404);
        die('Archivo no encontrado en el servidor.');
    }
    header('Content-Type: ' . $mime);
    header('Content-Disposition: attachment; filename="' . $book['file_name'] . '"');
    header('Content-Length: ' . filesize($fullPath));
    readfile($fullPath);
    exit;
}

// Descargar desde proveedor remoto (proxy)
$sm = StorageManager::getInstance();
$driver = $sm->getDriver($storageType);
header('Content-Type: ' . $mime);
header('Content-Disposition: attachment; filename="' . $book['file_name'] . '"');
$driver->download($storagePath, $storageFileId);
exit;
