<?php
/**
 * KlioReader3 - Instalador
 * Ejecutar una sola vez desde el navegador para inicializar la base de datos.
 * ELIMINAR ESTE ARCHIVO despues de la instalacion.
 */

$isCli = (php_sapi_name() === 'cli');

$checks = array();
$errors = array();

// 1. Version de PHP
$phpVersion = PHP_VERSION;
$phpOk = version_compare($phpVersion, '7.0.0', '>=');
$checks[] = array('PHP >= 7.0', $phpVersion, $phpOk);
if (!$phpOk) $errors[] = 'Se requiere PHP 7.0 o superior. Version actual: ' . $phpVersion;

// 2. Extensiones requeridas
$requiredExts = array('pdo_sqlite', 'json', 'mbstring');
foreach ($requiredExts as $ext) {
    $loaded = extension_loaded($ext);
    $checks[] = array('Extension ' . $ext, $loaded ? 'Instalada' : 'NO encontrada', $loaded);
    if (!$loaded) $errors[] = 'Extension requerida no encontrada: ' . $ext;
}

// 3. Crear directorio data/
$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    $created = @mkdir($dataDir, 0755, true);
    $checks[] = array('Directorio data/', $created ? 'Creado' : 'Error al crear', $created);
    if (!$created) $errors[] = 'No se pudo crear el directorio data/. Verificar permisos.';
} else {
    $checks[] = array('Directorio data/', 'Ya existe', true);
}

// 4. Crear directorio uploads/
$uploadsDir = __DIR__ . '/uploads';
if (!is_dir($uploadsDir)) {
    $created = @mkdir($uploadsDir, 0755, true);
    $checks[] = array('Directorio uploads/', $created ? 'Creado' : 'Error al crear', $created);
    if (!$created) $errors[] = 'No se pudo crear el directorio uploads/. Verificar permisos.';
} else {
    $checks[] = array('Directorio uploads/', 'Ya existe', true);
}

// 5. Verificar que data/ es escribible
$writable = is_writable($dataDir);
$checks[] = array('data/ escribible', $writable ? 'Si' : 'No', $writable);
if (!$writable) $errors[] = 'El directorio data/ no tiene permisos de escritura.';

// 6. Crear base de datos SQLite y ejecutar schema
$dbPath = $dataDir . '/klioreader.db';
$dbExisted = file_exists($dbPath);
$schemaOk = false;

if (empty($errors)) {
    try {
        $pdo = new PDO('sqlite:' . $dbPath, null, null, array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ));
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');

        $schemaFile = __DIR__ . '/migrations/schema.sql';
        if (!file_exists($schemaFile)) {
            $errors[] = 'Archivo schema.sql no encontrado en migrations/';
            $checks[] = array('Schema SQL', 'Archivo no encontrado', false);
        } else {
            $schema = file_get_contents($schemaFile);
            $pdo->exec($schema);
            $schemaOk = true;
            $checks[] = array('Base de datos SQLite', $dbExisted ? 'Actualizada' : 'Creada', true);
        }
    } catch (Exception $e) {
        $errors[] = 'Error al crear la base de datos: ' . $e->getMessage();
        $checks[] = array('Base de datos SQLite', 'Error: ' . $e->getMessage(), false);
    }
}

$success = empty($errors) && $schemaOk;

// Salida
if ($isCli) {
    echo "=== KlioReader3 - Instalador ===\n\n";
    foreach ($checks as $check) {
        echo ($check[2] ? '[OK]' : '[ERROR]') . ' ' . $check[0] . ': ' . $check[1] . "\n";
    }
    echo "\n";
    if ($success) {
        echo "Instalacion completada exitosamente.\n";
        echo "Base de datos: " . $dbPath . "\n";
        echo "\nIMPORTANTE: Eliminar este archivo (install.php) por seguridad.\n";
    } else {
        echo "Instalacion fallida. Errores:\n";
        foreach ($errors as $err) {
            echo "  - " . $err . "\n";
        }
    }
    exit;
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KlioReader3 - Instalador</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { max-width: 600px; width: 100%; padding: 2rem; }
        h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #f8fafc; }
        .check { display: flex; align-items: center; padding: 0.75rem 1rem; margin-bottom: 0.5rem; border-radius: 0.5rem; background: #1e293b; }
        .check-ok { border-left: 3px solid #22c55e; }
        .check-fail { border-left: 3px solid #ef4444; }
        .check-label { flex: 1; }
        .check-value { color: #94a3b8; font-size: 0.875rem; }
        .check-icon { margin-right: 0.75rem; font-size: 1.1rem; }
        .result { margin-top: 1.5rem; padding: 1.25rem; border-radius: 0.5rem; font-size: 1rem; }
        .result-ok { background: #14532d; color: #86efac; }
        .result-fail { background: #7f1d1d; color: #fca5a5; }
        .warning { margin-top: 1rem; padding: 1rem; background: #78350f; color: #fde68a; border-radius: 0.5rem; font-size: 0.875rem; }
        .db-path { margin-top: 0.5rem; font-size: 0.8rem; color: #64748b; word-break: break-all; }
    </style>
</head>
<body>
<div class="container">
    <h1>KlioReader3 - Instalador</h1>

    <?php foreach ($checks as $check): ?>
    <div class="check <?php echo $check[2] ? 'check-ok' : 'check-fail'; ?>">
        <span class="check-icon"><?php echo $check[2] ? '&#10003;' : '&#10007;'; ?></span>
        <span class="check-label"><?php echo htmlspecialchars($check[0]); ?></span>
        <span class="check-value"><?php echo htmlspecialchars($check[1]); ?></span>
    </div>
    <?php endforeach; ?>

    <?php if ($success): ?>
    <div class="result result-ok">
        Instalacion completada exitosamente.
    </div>
    <div class="db-path">Base de datos: <?php echo htmlspecialchars($dbPath); ?></div>
    <div class="warning">
        <strong>IMPORTANTE:</strong> Elimina este archivo (<code>install.php</code>) del servidor por seguridad.
    </div>
    <?php else: ?>
    <div class="result result-fail">
        La instalacion ha fallado. Revisa los errores indicados arriba.
    </div>
    <?php endif; ?>
</div>
</body>
</html>
