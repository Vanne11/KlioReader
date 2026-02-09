<?php
/**
 * KlioReader3 - Instalador
 * Ejecutar una sola vez desde el navegador para inicializar la base de datos.
 * ELIMINAR ESTE ARCHIVO despues de la instalacion.
 */

$isCli = (php_sapi_name() === 'cli');

// Proteccion: si la BD ya existe y tiene admin, bloquear re-ejecucion
$dbPathCheck = __DIR__ . '/data/klioreader.db';
if (file_exists($dbPathCheck)) {
    try {
        $checkPdo = new PDO('sqlite:' . $dbPathCheck, null, null, array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ));
        $adminCount = (int)$checkPdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
        $checkPdo = null;
        if ($adminCount > 0) {
            if ($isCli) {
                echo "La instalacion ya fue completada. La base de datos ya existe con un administrador.\n";
                exit(1);
            }
            // Calcular base_url manualmente
            $projectRoot = realpath(__DIR__);
            $docRoot = realpath($_SERVER['DOCUMENT_ROOT']);
            $basePath = '';
            if ($projectRoot && $docRoot && strpos($projectRoot, $docRoot) === 0) {
                $basePath = str_replace('\\', '/', substr($projectRoot, strlen($docRoot)));
            }
            $basePath = rtrim($basePath, '/');
            header('Location: ' . $basePath . '/admin/index.php');
            exit;
        }
    } catch (Exception $e) {
        // BD existe pero no tiene tabla users (instalacion corrupta), permitir continuar
    }
}

$checks = array();
$errors = array();
$adminCreated = false;
$adminError = '';

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
$pdo = null;

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

        // Migración 003: Deduplicación de archivos
        $migration003 = __DIR__ . '/migrations/003_add_file_dedup.sql';
        if (file_exists($migration003)) {
            $pdo->exec(file_get_contents($migration003));
            $checks[] = array('Migración 003 (dedup)', 'Aplicada', true);
        }

        // Migración 004: selected_title_id en users
        $migration004 = __DIR__ . '/migrations/004_add_selected_title.sql';
        if (file_exists($migration004)) {
            $cols = $pdo->query('PRAGMA table_info(users)')->fetchAll(PDO::FETCH_ASSOC);
            $hasSelectedTitle = false;
            foreach ($cols as $col) {
                if ($col['name'] === 'selected_title_id') {
                    $hasSelectedTitle = true;
                    break;
                }
            }
            if (!$hasSelectedTitle) {
                $pdo->exec(file_get_contents($migration004));
            }
            $checks[] = array('Migración 004 (título)', 'Aplicada', true);
        }
    } catch (Exception $e) {
        $errors[] = 'Error al crear la base de datos: ' . $e->getMessage();
        $checks[] = array('Base de datos SQLite', 'Error: ' . $e->getMessage(), false);
    }
}

$success = empty($errors) && $schemaOk;

// 7. Verificar si ya existe un admin
$adminExists = false;
if ($success && $pdo) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE role = 'admin'");
    $stmt->execute();
    $adminExists = (int)$stmt->fetchColumn() > 0;
}

// 8. Crear admin si se envio el formulario
if ($success && $pdo && $_SERVER['REQUEST_METHOD'] === 'POST' && !$adminExists) {
    $adminUser = trim(isset($_POST['admin_username']) ? $_POST['admin_username'] : '');
    $adminEmail = trim(isset($_POST['admin_email']) ? $_POST['admin_email'] : '');
    $adminPass = isset($_POST['admin_password']) ? $_POST['admin_password'] : '';

    if (strlen($adminUser) < 3) {
        $adminError = 'El username debe tener al menos 3 caracteres.';
    } elseif (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
        $adminError = 'Email invalido.';
    } elseif (strlen($adminPass) < 6) {
        $adminError = 'La contraseña debe tener al menos 6 caracteres.';
    } else {
        try {
            $hash = password_hash($adminPass, PASSWORD_BCRYPT);
            $stmt = $pdo->prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')");
            $stmt->execute(array($adminUser, $adminEmail, $hash));
            $adminCreated = true;
            $adminExists = true;
        } catch (PDOException $e) {
            $adminError = 'Error al crear admin: el username o email ya existe.';
        }
    }
}

// CLI
if ($isCli) {
    echo "=== KlioReader3 - Instalador ===\n\n";
    foreach ($checks as $check) {
        echo ($check[2] ? '[OK]' : '[ERROR]') . ' ' . $check[0] . ': ' . $check[1] . "\n";
    }
    echo "\n";
    if ($success) {
        if ($adminExists) {
            echo "Instalacion completada. Ya existe un usuario admin.\n";
        } else {
            echo "Base de datos creada. Abre install.php en el navegador para crear el admin.\n";
        }
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f14; color: #cdd6f4; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { max-width: 600px; width: 100%; padding: 2rem; }
        h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #cdd6f4; }
        h2 { font-size: 1.2rem; margin: 1.5rem 0 1rem; color: #cdd6f4; }
        .check { display: flex; align-items: center; padding: 0.75rem 1rem; margin-bottom: 0.5rem; border-radius: 0.5rem; background: #16161e; }
        .check-ok { border-left: 3px solid #22c55e; }
        .check-fail { border-left: 3px solid #ef4444; }
        .check-label { flex: 1; }
        .check-value { color: #6c7086; font-size: 0.875rem; }
        .check-icon { margin-right: 0.75rem; font-size: 1.1rem; }
        .result { margin-top: 1.5rem; padding: 1.25rem; border-radius: 0.5rem; font-size: 1rem; }
        .result-ok { background: rgba(34, 197, 94, 0.15); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.3); }
        .result-fail { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
        .warning { margin-top: 1rem; padding: 1rem; background: rgba(234, 179, 8, 0.15); color: #fde68a; border-radius: 0.5rem; font-size: 0.875rem; border: 1px solid rgba(234, 179, 8, 0.3); }
        .db-path { margin-top: 0.5rem; font-size: 0.8rem; color: #6c7086; word-break: break-all; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; margin-bottom: 0.4rem; font-size: 0.875rem; color: #6c7086; }
        .form-group input { width: 100%; padding: 0.6rem 0.8rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.1); background: #1c1c26; color: #cdd6f4; font-size: 0.95rem; }
        .form-group input:focus { outline: none; border-color: hsl(265, 89%, 78%); }
        .btn { display: inline-block; padding: 0.7rem 1.5rem; border-radius: 0.5rem; border: none; font-size: 0.95rem; cursor: pointer; background: hsl(265, 89%, 78%); color: #0f0f14; font-weight: 600; }
        .btn:hover { opacity: 0.9; }
        .error-msg { color: #fca5a5; font-size: 0.875rem; margin-bottom: 1rem; padding: 0.6rem 0.8rem; background: rgba(239, 68, 68, 0.15); border-radius: 0.5rem; }
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

    <?php if ($success && $adminCreated): ?>
    <div class="result result-ok">
        Instalacion completada. Usuario administrador creado exitosamente.
    </div>
    <div class="db-path">Base de datos: <?php echo htmlspecialchars($dbPath); ?></div>
    <div class="warning">
        <strong>IMPORTANTE:</strong> Elimina este archivo (<code>install.php</code>) del servidor por seguridad.
    </div>

    <?php elseif ($success && $adminExists): ?>
    <div class="result result-ok">
        Instalacion completada. Ya existe un usuario administrador.
    </div>
    <div class="db-path">Base de datos: <?php echo htmlspecialchars($dbPath); ?></div>
    <div class="warning">
        <strong>IMPORTANTE:</strong> Elimina este archivo (<code>install.php</code>) del servidor por seguridad.
    </div>

    <?php elseif ($success): ?>
    <div class="result result-ok">
        Base de datos creada exitosamente. Crea el usuario administrador:
    </div>

    <h2>Crear Administrador</h2>
    <?php if ($adminError): ?>
    <div class="error-msg"><?php echo htmlspecialchars($adminError); ?></div>
    <?php endif; ?>

    <form method="POST">
        <div class="form-group">
            <label>Username</label>
            <input type="text" name="admin_username" required minlength="3" value="<?php echo htmlspecialchars(isset($_POST['admin_username']) ? $_POST['admin_username'] : 'admin'); ?>">
        </div>
        <div class="form-group">
            <label>Email</label>
            <input type="email" name="admin_email" required value="<?php echo htmlspecialchars(isset($_POST['admin_email']) ? $_POST['admin_email'] : ''); ?>">
        </div>
        <div class="form-group">
            <label>Password</label>
            <input type="password" name="admin_password" required minlength="6">
        </div>
        <button type="submit" class="btn">Crear Admin</button>
    </form>

    <?php else: ?>
    <div class="result result-fail">
        La instalacion ha fallado. Revisa los errores indicados arriba.
    </div>
    <?php endif; ?>
</div>
</body>
</html>
