<?php
require_once __DIR__ . '/../templates/admin-guard.php';
require_once __DIR__ . '/../templates/csrf.php';

$pdo = db();

// Asegurar que existe la tabla migrations
$pdo->exec("CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    executed_at TEXT DEFAULT (datetime('now')),
    success INTEGER DEFAULT 1,
    error_message TEXT DEFAULT NULL,
    checksum TEXT DEFAULT NULL
)");

$migrationsDir = dirname(__DIR__) . '/migrations';
$backupsDir = dirname(__DIR__) . '/data/backups';
$dbPath = dirname(__DIR__) . '/data/klioreader.db';

// Crear directorio de backups si no existe
if (!is_dir($backupsDir)) {
    @mkdir($backupsDir, 0755, true);
}

// --- Funciones auxiliares ---

function get_migration_files() {
    global $migrationsDir;
    $files = glob($migrationsDir . '/[0-9]*_*.sql');
    if (!$files) return array();
    sort($files);
    $result = array();
    foreach ($files as $f) {
        $name = basename($f);
        if (preg_match('/^\d{3}_[a-z0-9_]+\.sql$/', $name)) {
            $result[] = $name;
        }
    }
    return $result;
}

function get_executed_migrations() {
    global $pdo;
    $rows = $pdo->query('SELECT filename, executed_at, success, error_message FROM migrations ORDER BY filename ASC')->fetchAll();
    $map = array();
    foreach ($rows as $r) {
        $map[$r['filename']] = $r;
    }
    return $map;
}

function create_backup($label = '') {
    global $dbPath, $backupsDir;
    if (!file_exists($dbPath)) return array('ok' => false, 'error' => 'Base de datos no encontrada');
    $timestamp = date('Y-m-d_H-i-s');
    $safeName = 'backup_' . $timestamp . ($label ? '_' . $label : '') . '.db';
    $dest = $backupsDir . '/' . $safeName;
    if (!copy($dbPath, $dest)) {
        return array('ok' => false, 'error' => 'No se pudo copiar la base de datos');
    }
    return array('ok' => true, 'file' => $safeName);
}

function run_migration_file($filename) {
    global $pdo, $migrationsDir;
    $safeName = basename($filename);
    if (!preg_match('/^\d{3}_[a-z0-9_]+\.sql$/', $safeName)) {
        return array('ok' => false, 'error' => 'Nombre de archivo invalido');
    }
    $filePath = $migrationsDir . '/' . $safeName;
    if (!file_exists($filePath)) {
        return array('ok' => false, 'error' => 'Archivo no encontrado');
    }

    $sql = file_get_contents($filePath);
    $statements = array_filter(array_map('trim', explode(';', $sql)));

    $errorMsg = '';
    $ok = true;
    foreach ($statements as $stmt) {
        if (empty($stmt) || strpos($stmt, '--') === 0) continue;
        try {
            $pdo->exec($stmt);
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), 'duplicate column') === false
                && strpos($e->getMessage(), 'already exists') === false) {
                $ok = false;
                $errorMsg = $e->getMessage();
                break;
            }
        }
    }

    // Registrar resultado
    $stmtIns = $pdo->prepare('INSERT OR REPLACE INTO migrations (filename, success, error_message, checksum) VALUES (?, ?, ?, ?)');
    $stmtIns->execute(array($safeName, $ok ? 1 : 0, $errorMsg ?: null, md5_file($filePath)));

    return array('ok' => $ok, 'error' => $errorMsg);
}

// --- Auto-deteccion legacy ---
$executedCount = (int)$pdo->query('SELECT COUNT(*) FROM migrations')->fetchColumn();
if ($executedCount === 0) {
    // 002: verificar si columna storage_type existe en books
    try {
        $pdo->query('SELECT storage_type FROM books LIMIT 0');
        $file002 = $migrationsDir . '/002_add_storage_columns.sql';
        if (file_exists($file002)) {
            $stmtLeg = $pdo->prepare('INSERT OR IGNORE INTO migrations (filename, success, error_message, checksum) VALUES (?, 1, ?, ?)');
            $stmtLeg->execute(array('002_add_storage_columns.sql', 'Auto-detectada como ya aplicada', md5_file($file002)));
        }
    } catch (Exception $e) {
        // No existe la columna, la migracion no fue aplicada
    }

    // 003: verificar si existe setting registration_enabled
    try {
        $regCheck = $pdo->query("SELECT COUNT(*) FROM site_settings WHERE key = 'registration_enabled'")->fetchColumn();
        if ((int)$regCheck > 0) {
            $file003 = $migrationsDir . '/003_add_registration_toggle.sql';
            if (file_exists($file003)) {
                $stmtLeg = $pdo->prepare('INSERT OR IGNORE INTO migrations (filename, success, error_message, checksum) VALUES (?, 1, ?, ?)');
                $stmtLeg->execute(array('003_add_registration_toggle.sql', 'Auto-detectada como ya aplicada', md5_file($file003)));
            }
        }
    } catch (Exception $e) {
        // tabla site_settings no existe
    }
}

// --- Procesar acciones POST ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = isset($_POST['action']) ? $_POST['action'] : '';

    if ($action === 'run_migration') {
        $file = isset($_POST['filename']) ? basename($_POST['filename']) : '';
        if (!$file || !preg_match('/^\d{3}_[a-z0-9_]+\.sql$/', $file)) {
            flash('error', 'Nombre de migracion invalido.');
        } else {
            // Crear backup antes de ejecutar
            $label = 'pre_' . str_replace('.sql', '', $file);
            $backup = create_backup($label);
            if (!$backup['ok']) {
                flash('error', 'No se pudo crear backup previo: ' . $backup['error'] . '. Migracion cancelada.');
            } else {
                $result = run_migration_file($file);
                if ($result['ok']) {
                    flash('success', 'Migracion ' . $file . ' ejecutada correctamente. Backup: ' . $backup['file']);
                } else {
                    flash('error', 'Error en migracion ' . $file . ': ' . $result['error'] . '. Backup disponible: ' . $backup['file']);
                }
            }
        }
        redirect(base_url('admin/migrations.php'));
    }

    if ($action === 'mark_executed') {
        $file = isset($_POST['filename']) ? basename($_POST['filename']) : '';
        if (!$file || !preg_match('/^\d{3}_[a-z0-9_]+\.sql$/', $file)) {
            flash('error', 'Nombre de migracion invalido.');
        } else {
            $filePath = $migrationsDir . '/' . $file;
            $checksum = file_exists($filePath) ? md5_file($filePath) : null;
            $stmtMark = $pdo->prepare('INSERT OR IGNORE INTO migrations (filename, success, error_message, checksum) VALUES (?, 1, ?, ?)');
            $stmtMark->execute(array($file, 'Marcada manualmente como ejecutada', $checksum));
            flash('success', 'Migracion ' . $file . ' marcada como ejecutada.');
        }
        redirect(base_url('admin/migrations.php'));
    }

    if ($action === 'download_backup') {
        $file = isset($_POST['filename']) ? basename($_POST['filename']) : '';
        $fullPath = $backupsDir . '/' . $file;
        $realPath = realpath($fullPath);
        $realBackups = realpath($backupsDir);
        if (!$file || !$realPath || !$realBackups || strpos($realPath, $realBackups) !== 0 || !file_exists($realPath)) {
            flash('error', 'Backup no encontrado.');
            redirect(base_url('admin/migrations.php'));
        }
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $file . '"');
        header('Content-Length: ' . filesize($realPath));
        readfile($realPath);
        exit;
    }

    if ($action === 'delete_backup') {
        $file = isset($_POST['filename']) ? basename($_POST['filename']) : '';
        $fullPath = $backupsDir . '/' . $file;
        $realPath = realpath($fullPath);
        $realBackups = realpath($backupsDir);
        if (!$file || !$realPath || !$realBackups || strpos($realPath, $realBackups) !== 0) {
            flash('error', 'Backup no encontrado.');
        } else {
            @unlink($realPath);
            flash('success', 'Backup ' . $file . ' eliminado.');
        }
        redirect(base_url('admin/migrations.php'));
    }
}

// --- Datos para la vista ---
$allFiles = get_migration_files();
$executed = get_executed_migrations();
$pending = array();
$history = array();

foreach ($allFiles as $f) {
    if (isset($executed[$f])) {
        $history[] = $executed[$f];
    } else {
        $pending[] = $f;
    }
}

// Backups
$backupFiles = array();
if (is_dir($backupsDir)) {
    $bFiles = glob($backupsDir . '/*.db');
    if ($bFiles) {
        rsort($bFiles); // mas recientes primero
        foreach ($bFiles as $bf) {
            $backupFiles[] = array(
                'name' => basename($bf),
                'size' => filesize($bf),
                'date' => date('Y-m-d H:i:s', filemtime($bf)),
            );
        }
    }
}

$countPending = count($pending);
$countExecuted = count($history);
$countBackups = count($backupFiles);

$pageTitle = 'Migraciones';
require_once __DIR__ . '/../templates/admin-layout.php';
?>

<h1 class="text-2xl font-bold mb-6">Migraciones</h1>

<!-- Stats -->
<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
    <div class="stat-card">
        <div class="text-klio-muted text-xs font-medium uppercase tracking-wider">Pendientes</div>
        <div class="text-2xl font-bold mt-1 <?php echo $countPending > 0 ? 'text-yellow-400' : 'text-green-400'; ?>"><?php echo $countPending; ?></div>
    </div>
    <div class="stat-card">
        <div class="text-klio-muted text-xs font-medium uppercase tracking-wider">Ejecutadas</div>
        <div class="text-2xl font-bold mt-1"><?php echo $countExecuted; ?></div>
    </div>
    <div class="stat-card">
        <div class="text-klio-muted text-xs font-medium uppercase tracking-wider">Backups</div>
        <div class="text-2xl font-bold mt-1"><?php echo $countBackups; ?></div>
    </div>
</div>

<!-- Migraciones pendientes -->
<div class="bg-klio-card border border-klio-border rounded-xl overflow-hidden mb-6">
    <div class="px-5 py-4 border-b border-klio-border">
        <h2 class="font-semibold text-sm">Migraciones Pendientes</h2>
    </div>
    <?php if ($countPending === 0): ?>
    <div class="p-5 flex items-center gap-3">
        <div class="w-2 h-2 rounded-full bg-green-400"></div>
        <span class="text-sm text-green-400">Todo al dia. No hay migraciones pendientes.</span>
    </div>
    <?php else: ?>
    <div class="p-5">
        <div class="flex items-center gap-3 mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div class="w-2 h-2 rounded-full bg-yellow-400"></div>
            <span class="text-sm text-yellow-400">Hay <?php echo $countPending; ?> migracion(es) pendiente(s). Se creara un backup automatico antes de ejecutar.</span>
        </div>
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Archivo</th>
                    <th class="text-right">Acciones</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($pending as $pf): ?>
                <tr>
                    <td>
                        <span class="font-mono text-sm"><?php echo e($pf); ?></span>
                    </td>
                    <td class="text-right">
                        <form method="POST" class="inline-flex gap-2" onsubmit="return confirm('Ejecutar migracion <?php echo e($pf); ?>? Se creara un backup automatico.');">
                            <?php echo csrf_field(); ?>
                            <input type="hidden" name="action" value="run_migration">
                            <input type="hidden" name="filename" value="<?php echo e($pf); ?>">
                            <button type="submit" class="px-3 py-1.5 text-xs rounded-lg bg-klio-primary/15 text-klio-primary border border-klio-primary/30 hover:bg-klio-primary/25 transition-colors">
                                Ejecutar
                            </button>
                        </form>
                        <form method="POST" class="inline-flex gap-2" onsubmit="return confirm('Marcar <?php echo e($pf); ?> como ya ejecutada sin correrla?');">
                            <?php echo csrf_field(); ?>
                            <input type="hidden" name="action" value="mark_executed">
                            <input type="hidden" name="filename" value="<?php echo e($pf); ?>">
                            <button type="submit" class="px-3 py-1.5 text-xs rounded-lg bg-klio-elevated text-klio-muted border border-klio-border hover:text-klio-text transition-colors">
                                Marcar ejecutada
                            </button>
                        </form>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php endif; ?>
</div>

<!-- Historial de migraciones -->
<div class="bg-klio-card border border-klio-border rounded-xl overflow-hidden mb-6">
    <div class="px-5 py-4 border-b border-klio-border">
        <h2 class="font-semibold text-sm">Historial</h2>
    </div>
    <?php if (empty($history)): ?>
    <div class="p-5 text-center text-klio-muted text-sm py-6">Sin migraciones ejecutadas aun.</div>
    <?php else: ?>
    <table class="admin-table">
        <thead>
            <tr>
                <th>Archivo</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Detalle</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($history as $h): ?>
            <tr>
                <td><span class="font-mono text-sm"><?php echo e($h['filename']); ?></span></td>
                <td class="text-klio-muted text-xs"><?php echo e($h['executed_at']); ?></td>
                <td>
                    <?php if ((int)$h['success']): ?>
                    <span class="px-2 py-0.5 rounded-full text-xs bg-green-500/15 text-green-400">OK</span>
                    <?php else: ?>
                    <span class="px-2 py-0.5 rounded-full text-xs bg-red-500/15 text-red-400">Error</span>
                    <?php endif; ?>
                </td>
                <td class="text-klio-muted text-xs max-w-xs truncate"><?php echo e($h['error_message'] ?? ''); ?></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <?php endif; ?>
</div>

<!-- Backups -->
<div class="bg-klio-card border border-klio-border rounded-xl overflow-hidden">
    <div class="px-5 py-4 border-b border-klio-border">
        <h2 class="font-semibold text-sm">Backups</h2>
    </div>
    <?php if (empty($backupFiles)): ?>
    <div class="p-5 text-center text-klio-muted text-sm py-6">No hay backups disponibles.</div>
    <?php else: ?>
    <table class="admin-table">
        <thead>
            <tr>
                <th>Nombre</th>
                <th>Tamano</th>
                <th>Fecha</th>
                <th class="text-right">Acciones</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($backupFiles as $bf): ?>
            <tr>
                <td><span class="font-mono text-xs"><?php echo e($bf['name']); ?></span></td>
                <td class="text-klio-muted text-xs"><?php echo format_bytes($bf['size']); ?></td>
                <td class="text-klio-muted text-xs"><?php echo e($bf['date']); ?></td>
                <td class="text-right">
                    <form method="POST" class="inline-flex">
                        <?php echo csrf_field(); ?>
                        <input type="hidden" name="action" value="download_backup">
                        <input type="hidden" name="filename" value="<?php echo e($bf['name']); ?>">
                        <button type="submit" class="px-2 py-1 text-xs rounded-lg bg-klio-elevated text-klio-muted border border-klio-border hover:text-klio-text transition-colors">
                            Descargar
                        </button>
                    </form>
                    <form method="POST" class="inline-flex ml-1" onsubmit="return confirm('Eliminar backup <?php echo e($bf['name']); ?>?');">
                        <?php echo csrf_field(); ?>
                        <input type="hidden" name="action" value="delete_backup">
                        <input type="hidden" name="filename" value="<?php echo e($bf['name']); ?>">
                        <button type="submit" class="px-2 py-1 text-xs rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">
                            Eliminar
                        </button>
                    </form>
                </td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <?php endif; ?>
</div>

    </main>
</div>
</body>
</html>
