<?php
require_once __DIR__ . '/../templates/admin-guard.php';
require_once __DIR__ . '/../src/Config/Database.php';
require_once __DIR__ . '/../src/Storage/StorageDriver.php';
require_once __DIR__ . '/../src/Storage/LocalDriver.php';
require_once __DIR__ . '/../src/Storage/B2Driver.php';
require_once __DIR__ . '/../src/Storage/S3Driver.php';
require_once __DIR__ . '/../src/Storage/GCSDriver.php';
require_once __DIR__ . '/../src/Storage/GoogleDriveDriver.php';
require_once __DIR__ . '/../src/Storage/StorageManager.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(array('ok' => false, 'message' => 'Metodo no permitido'));
    exit;
}

$provider = isset($_POST['provider']) ? $_POST['provider'] : '';

$configMap = array(
    'b2' => array(
        'b2_key_id' => trim($_POST['b2_key_id'] ?? ''),
        'b2_app_key' => trim($_POST['b2_app_key'] ?? ''),
        'b2_bucket_name' => trim($_POST['b2_bucket_name'] ?? ''),
        'b2_bucket_id' => trim($_POST['b2_bucket_id'] ?? ''),
    ),
    's3' => array(
        's3_access_key' => trim($_POST['s3_access_key'] ?? ''),
        's3_secret_key' => trim($_POST['s3_secret_key'] ?? ''),
        's3_bucket' => trim($_POST['s3_bucket'] ?? ''),
        's3_region' => trim($_POST['s3_region'] ?? 'us-east-1'),
        's3_endpoint' => trim($_POST['s3_endpoint'] ?? ''),
    ),
    'gcs' => array(
        'gcs_access_key' => trim($_POST['gcs_access_key'] ?? ''),
        'gcs_secret_key' => trim($_POST['gcs_secret_key'] ?? ''),
        'gcs_bucket' => trim($_POST['gcs_bucket'] ?? ''),
    ),
    'gdrive' => array(
        'gdrive_key_file' => trim($_POST['gdrive_key_file'] ?? ''),
        'gdrive_folder_id' => trim($_POST['gdrive_folder_id'] ?? ''),
    ),
    'local' => array(),
);

if (!isset($configMap[$provider])) {
    echo json_encode(array('ok' => false, 'message' => 'Proveedor no valido: ' . $provider));
    exit;
}

try {
    $sm = StorageManager::getInstance();
    $driver = $sm->getDriverWithConfig($provider, $configMap[$provider]);
    $result = $driver->test();
    echo json_encode($result);
} catch (Exception $e) {
    echo json_encode(array('ok' => false, 'message' => 'Error: ' . $e->getMessage()));
}
