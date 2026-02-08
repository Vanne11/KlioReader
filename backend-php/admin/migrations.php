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

function get_restore_history() {
    global $backupsDir;
    $jsonPath = $backupsDir . '/restore_history.json';
    if (!file_exists($jsonPath)) return array();
    $data = json_decode(file_get_contents($jsonPath), true);
    return is_array($data) ? $data : array();
}

function add_restore_entry($entry) {
    global $backupsDir;
    $jsonPath = $backupsDir . '/restore_history.json';
    $history = get_restore_history();
    $history[] = $entry;
    file_put_contents($jsonPath, json_encode($history, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
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
        // Eliminar lineas de comentarios SQL del statement
        $lines = explode("\n", $stmt);
        $cleaned = array();
        foreach ($lines as $line) {
            $trimmedLine = trim($line);
            if ($trimmedLine !== '' && strpos($trimmedLine, '--') !== 0) {
                $cleaned[] = $line;
            }
        }
        $stmt = trim(implode("\n", $cleaned));
        if (empty($stmt)) continue;
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

    if ($action === 'restore_backup') {
        $file = isset($_POST['filename']) ? basename($_POST['filename']) : '';
        $reason = trim(isset($_POST['restore_reason']) ? $_POST['restore_reason'] : '');
        $fullPath = $backupsDir . '/' . $file;
        $realPath = realpath($fullPath);
        $realBackups = realpath($backupsDir);

        if (!$file || !$realPath || !$realBackups || strpos($realPath, $realBackups) !== 0 || !file_exists($realPath)) {
            flash('error', 'Backup no encontrado.');
        } elseif (strlen($reason) < 3) {
            flash('error', 'Debes indicar una razon para la restauracion (minimo 3 caracteres).');
        } else {
            // Guardar la BD actual como "reemplazada"
            $timestamp = date('Y-m-d_H-i-s');
            $replacedName = 'replaced_' . $timestamp . '.db';
            $replacedPath = $backupsDir . '/' . $replacedName;

            // Cerrar conexion PDO antes de copiar
            $pdo = null;

            $savedCurrent = copy($dbPath, $replacedPath);
            $restored = copy($realPath, $dbPath);

            if (!$savedCurrent) {
                flash('error', 'No se pudo guardar la base de datos actual antes de restaurar.');
            } elseif (!$restored) {
                flash('error', 'No se pudo restaurar el backup. La BD actual fue guardada como ' . $replacedName);
            } else {
                // Registrar en historial JSON
                add_restore_entry(array(
                    'date' => date('Y-m-d H:i:s'),
                    'restored_from' => $file,
                    'replaced_file' => $replacedName,
                    'replaced_size' => filesize($replacedPath),
                    'reason' => $reason,
                    'admin_user' => isset($_SESSION['admin_username']) ? $_SESSION['admin_username'] : 'unknown',
                ));
                flash('success', 'Base de datos restaurada desde ' . $file . '. La BD anterior fue guardada como ' . $replacedName);
            }
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
    if (isset($executed[$f]) && (int)$executed[$f]['success'] === 1) {
        $history[] = $executed[$f];
    } else {
        // Pendiente: incluir info de error si hubo un intento fallido previo
        $lastError = (isset($executed[$f]) && !$executed[$f]['success']) ? $executed[$f]['error_message'] : null;
        $lastAttempt = (isset($executed[$f]) && !$executed[$f]['success']) ? $executed[$f]['executed_at'] : null;
        $pending[] = array('filename' => $f, 'last_error' => $lastError, 'last_attempt' => $lastAttempt);
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

// Historial de restauraciones
$restoreHistory = array_reverse(get_restore_history()); // mas recientes primero

$countPending = count($pending);
$countFailed = 0;
foreach ($pending as $p) { if ($p['last_error']) $countFailed++; }
$countExecuted = count($history);
$countBackups = count($backupFiles);
$countRestores = count($restoreHistory);

$pageTitle = 'Migraciones';
require_once __DIR__ . '/../templates/admin-layout.php';
?>

<h1 class="text-2xl font-bold mb-6">Migraciones</h1>

<!-- Stats -->
<div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
    <div class="stat-card">
        <div class="text-klio-muted text-xs font-medium uppercase tracking-wider">Pendientes</div>
        <div class="text-2xl font-bold mt-1 <?php echo $countPending > 0 ? ($countFailed > 0 ? 'text-red-400' : 'text-yellow-400') : 'text-green-400'; ?>"><?php echo $countPending; ?><?php if ($countFailed > 0): ?><span class="text-sm text-red-400 ml-1">(<?php echo $countFailed; ?> con error)</span><?php endif; ?></div>
    </div>
    <div class="stat-card">
        <div class="text-klio-muted text-xs font-medium uppercase tracking-wider">Ejecutadas</div>
        <div class="text-2xl font-bold mt-1"><?php echo $countExecuted; ?></div>
    </div>
    <div class="stat-card">
        <div class="text-klio-muted text-xs font-medium uppercase tracking-wider">Backups</div>
        <div class="text-2xl font-bold mt-1"><?php echo $countBackups; ?></div>
    </div>
    <div class="stat-card">
        <div class="text-klio-muted text-xs font-medium uppercase tracking-wider">Restauraciones</div>
        <div class="text-2xl font-bold mt-1"><?php echo $countRestores; ?></div>
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
        <?php if ($countFailed > 0): ?>
        <div class="flex items-center gap-3 mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <div class="w-2 h-2 rounded-full bg-red-400"></div>
            <span class="text-sm text-red-400"><?php echo $countFailed; ?> migracion(es) fallida(s) que puedes reintentar. Se creara un backup automatico antes de ejecutar.</span>
        </div>
        <?php endif; ?>
        <?php if ($countPending - $countFailed > 0): ?>
        <div class="flex items-center gap-3 mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div class="w-2 h-2 rounded-full bg-yellow-400"></div>
            <span class="text-sm text-yellow-400">Hay <?php echo $countPending - $countFailed; ?> migracion(es) nueva(s) pendiente(s). Se creara un backup automatico antes de ejecutar.</span>
        </div>
        <?php endif; ?>
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
                        <span class="font-mono text-sm"><?php echo e($pf['filename']); ?></span>
                        <?php if ($pf['last_error']): ?>
                        <div class="mt-1.5 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                            <span class="text-xs text-red-400 font-medium">Ultimo intento fallido</span>
                            <span class="text-xs text-klio-muted ml-1">(<?php echo e($pf['last_attempt']); ?>)</span>
                            <div class="text-xs text-red-300/80 mt-0.5 font-mono break-all"><?php echo e($pf['last_error']); ?></div>
                        </div>
                        <?php endif; ?>
                    </td>
                    <td class="text-right">
                        <form method="POST" class="inline-flex gap-2" onsubmit="return confirm('<?php echo $pf['last_error'] ? 'Reintentar' : 'Ejecutar'; ?> migracion <?php echo e($pf['filename']); ?>? Se creara un backup automatico.');">
                            <?php echo csrf_field(); ?>
                            <input type="hidden" name="action" value="run_migration">
                            <input type="hidden" name="filename" value="<?php echo e($pf['filename']); ?>">
                            <button type="submit" class="px-3 py-1.5 text-xs rounded-lg bg-klio-primary/15 text-klio-primary border border-klio-primary/30 hover:bg-klio-primary/25 transition-colors">
                                <?php echo $pf['last_error'] ? 'Reintentar' : 'Ejecutar'; ?>
                            </button>
                        </form>
                        <form method="POST" class="inline-flex gap-2" onsubmit="return confirm('Marcar <?php echo e($pf['filename']); ?> como ya ejecutada sin correrla?');">
                            <?php echo csrf_field(); ?>
                            <input type="hidden" name="action" value="mark_executed">
                            <input type="hidden" name="filename" value="<?php echo e($pf['filename']); ?>">
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
                    <button type="button" onclick="openRestoreModal('<?php echo e($bf['name']); ?>')" class="px-2 py-1 text-xs rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors ml-1">
                        Restaurar
                    </button>
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

<!-- Historial de restauraciones -->
<?php if ($countRestores > 0): ?>
<div class="bg-klio-card border border-klio-border rounded-xl overflow-hidden mt-6">
    <div class="px-5 py-4 border-b border-klio-border">
        <h2 class="font-semibold text-sm">Historial de Restauraciones</h2>
    </div>
    <table class="admin-table">
        <thead>
            <tr>
                <th>Fecha</th>
                <th>Restaurado desde</th>
                <th>BD reemplazada</th>
                <th>Razon</th>
                <th>Admin</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($restoreHistory as $rh): ?>
            <tr>
                <td class="text-klio-muted text-xs whitespace-nowrap"><?php echo e($rh['date']); ?></td>
                <td><span class="font-mono text-xs"><?php echo e($rh['restored_from']); ?></span></td>
                <td><span class="font-mono text-xs"><?php echo e($rh['replaced_file']); ?></span></td>
                <td class="text-sm max-w-xs"><?php echo e($rh['reason']); ?></td>
                <td class="text-klio-muted text-xs"><?php echo e($rh['admin_user']); ?></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>
<?php endif; ?>

<!-- Modal restaurar backup -->
<div id="restoreModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 hidden items-center justify-center">
    <div class="bg-klio-card border border-klio-border rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div class="px-5 py-4 border-b border-klio-border">
            <h3 class="font-semibold text-sm">Restaurar Base de Datos</h3>
        </div>
        <form method="POST" id="restoreForm">
            <?php echo csrf_field(); ?>
            <input type="hidden" name="action" value="restore_backup">
            <input type="hidden" name="filename" id="restoreFilename" value="">
            <div class="p-5">
                <div class="flex items-center gap-3 mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <div class="w-2 h-2 rounded-full bg-yellow-400 shrink-0"></div>
                    <span class="text-xs text-yellow-400">La base de datos actual sera guardada automaticamente antes de reemplazarla.</span>
                </div>
                <p class="text-sm text-klio-muted mb-1">Restaurar: <span id="restoreFilenameDisplay" class="font-mono text-klio-text"></span></p>
                <div class="mt-4">
                    <label class="block text-sm text-klio-muted mb-2">Razon de la restauracion <span class="text-red-400">*</span></label>
                    <textarea name="restore_reason" id="restoreReason" rows="3" required minlength="3" placeholder="Ej: Revertir migracion fallida, datos corruptos, etc." class="w-full px-3 py-2 rounded-lg bg-klio-elevated border border-klio-border text-klio-text text-sm placeholder-klio-muted/50 focus:outline-none focus:border-klio-primary resize-none"></textarea>
                </div>
            </div>
            <div class="px-5 py-4 border-t border-klio-border flex justify-end gap-2">
                <button type="button" onclick="closeRestoreModal()" class="px-4 py-2 text-xs rounded-lg bg-klio-elevated text-klio-muted border border-klio-border hover:text-klio-text transition-colors">
                    Cancelar
                </button>
                <button type="submit" class="px-4 py-2 text-xs rounded-lg bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/25 transition-colors font-medium">
                    Restaurar
                </button>
            </div>
        </form>
    </div>
</div>

<script>
function openRestoreModal(filename) {
    document.getElementById('restoreFilename').value = filename;
    document.getElementById('restoreFilenameDisplay').textContent = filename;
    document.getElementById('restoreReason').value = '';
    var modal = document.getElementById('restoreModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('restoreReason').focus();
}
function closeRestoreModal() {
    var modal = document.getElementById('restoreModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}
document.getElementById('restoreModal').addEventListener('click', function(e) {
    if (e.target === this) closeRestoreModal();
});
</script>

    </main>
</div>
</body>
</html>
