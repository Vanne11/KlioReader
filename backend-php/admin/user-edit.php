<?php
require_once __DIR__ . '/../templates/admin-guard.php';
require_once __DIR__ . '/../templates/csrf.php';

$pdo = db();
$userId = (int)(isset($_GET['id']) ? $_GET['id'] : 0);

if (!$userId) {
    redirect(base_url('admin/users.php'));
}

// Obtener usuario
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute(array($userId));
$user = $stmt->fetch();

if (!$user) {
    flash('error', 'Usuario no encontrado.');
    redirect(base_url('admin/users.php'));
}

// Actualizar
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $role = in_array($_POST['role'] ?? '', array('user', 'admin')) ? $_POST['role'] : 'user';
    $uploadLimit = (int)($_POST['upload_limit_mb'] ?? 500) * 1048576; // MB a bytes
    $isSubscriber = isset($_POST['is_subscriber']) ? 1 : 0;
    $newPassword = $_POST['new_password'] ?? '';

    if (strlen($username) < 3 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        flash('error', 'Username (min 3) y email valido requeridos.');
        redirect(base_url('admin/user-edit.php?id=' . $userId));
    }

    try {
        if ($newPassword && strlen($newPassword) >= 6) {
            $hash = password_hash($newPassword, PASSWORD_BCRYPT);
            $stmt = $pdo->prepare('UPDATE users SET username = ?, email = ?, role = ?, upload_limit = ?, is_subscriber = ?, password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?');
            $stmt->execute(array($username, $email, $role, $uploadLimit, $isSubscriber, $hash, $userId));
        } else {
            $stmt = $pdo->prepare('UPDATE users SET username = ?, email = ?, role = ?, upload_limit = ?, is_subscriber = ?, updated_at = datetime(\'now\') WHERE id = ?');
            $stmt->execute(array($username, $email, $role, $uploadLimit, $isSubscriber, $userId));
        }

        flash('success', 'Usuario actualizado.');
        redirect(base_url('admin/user-edit.php?id=' . $userId));
    } catch (PDOException $e) {
        flash('error', 'El username o email ya esta en uso.');
        redirect(base_url('admin/user-edit.php?id=' . $userId));
    }
}

// Stats del usuario
$bookCount = (int)$pdo->prepare('SELECT COUNT(*) FROM books WHERE user_id = ?')->execute(array($userId)) ? $pdo->query("SELECT COUNT(*) FROM books WHERE user_id = $userId")->fetchColumn() : 0;
$storageUsed = (int)$user['storage_used'];
$uploadLimit = (int)$user['upload_limit'];
$storagePct = $uploadLimit > 0 ? min(100, round(($storageUsed / $uploadLimit) * 100)) : 0;

$pageTitle = 'Editar Usuario';
require_once __DIR__ . '/../templates/admin-layout.php';
?>

<div class="flex items-center gap-3 mb-6">
    <a href="<?php echo base_url('admin/users.php'); ?>" class="text-klio-muted hover:text-klio-text transition-colors">&larr;</a>
    <h1 class="text-xl md:text-2xl font-bold">Editar Usuario</h1>
</div>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Formulario -->
    <div class="lg:col-span-2">
        <div class="bg-klio-card border border-klio-border rounded-xl p-6">
            <form method="POST" class="space-y-4">
                <?php echo csrf_field(); ?>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="form-label">Username</label>
                        <input type="text" name="username" required minlength="3"
                            value="<?php echo e($user['username']); ?>" class="form-input">
                    </div>
                    <div>
                        <label class="form-label">Email</label>
                        <input type="email" name="email" required
                            value="<?php echo e($user['email']); ?>" class="form-input">
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="form-label">Role</label>
                        <select name="role" class="form-input">
                            <option value="user" <?php echo $user['role'] === 'user' ? 'selected' : ''; ?>>User</option>
                            <option value="admin" <?php echo $user['role'] === 'admin' ? 'selected' : ''; ?>>Admin</option>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">Limite de subida (MB)</label>
                        <input type="number" name="upload_limit_mb" min="0" step="1"
                            value="<?php echo round($uploadLimit / 1048576); ?>" class="form-input">
                    </div>
                </div>

                <div>
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" name="is_subscriber" value="1" <?php echo (int)$user['is_subscriber'] ? 'checked' : ''; ?>
                            class="w-4 h-4 rounded border-white/20 bg-klio-elevated text-klio-primary focus:ring-klio-primary">
                        <span class="form-label mb-0">Suscriptor Cloud</span>
                        <span class="text-klio-muted text-xs">(muestra corona y acceso a KlioReader Cloud)</span>
                    </label>
                </div>

                <div>
                    <label class="form-label">Nueva Password (dejar vacio para no cambiar)</label>
                    <input type="password" name="new_password" minlength="6" class="form-input" placeholder="Min. 6 caracteres">
                </div>

                <div class="flex justify-end pt-2">
                    <button type="submit" class="btn-primary">Guardar Cambios</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Info lateral -->
    <div class="space-y-4">
        <div class="stat-card">
            <div class="text-klio-muted text-xs font-medium uppercase tracking-wider mb-3">Almacenamiento</div>
            <div class="text-lg font-bold"><?php echo format_bytes($storageUsed); ?> <span class="text-klio-muted text-sm font-normal">/ <?php echo format_bytes($uploadLimit); ?></span></div>
            <div class="w-full h-2 bg-klio-elevated rounded-full mt-3">
                <div class="progress-bar" style="width: <?php echo $storagePct; ?>%"></div>
            </div>
            <div class="text-klio-muted text-xs mt-2"><?php echo $storagePct; ?>% usado</div>
        </div>

        <div class="stat-card">
            <div class="text-klio-muted text-xs font-medium uppercase tracking-wider mb-2">Informacion</div>
            <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-klio-muted">ID</span><span><?php echo $user['id']; ?></span></div>
                <div class="flex justify-between"><span class="text-klio-muted">Libros</span><span><?php echo $bookCount; ?></span></div>
                <div class="flex justify-between"><span class="text-klio-muted">XP</span><span><?php echo (int)$user['xp']; ?></span></div>
                <div class="flex justify-between"><span class="text-klio-muted">Nivel</span><span><?php echo (int)$user['level']; ?></span></div>
                <div class="flex justify-between"><span class="text-klio-muted">Racha</span><span><?php echo (int)$user['streak']; ?></span></div>
                <div class="flex justify-between"><span class="text-klio-muted">Creado</span><span class="text-xs"><?php echo e(substr($user['created_at'], 0, 10)); ?></span></div>
            </div>
        </div>
    </div>
</div>

    </main>
</div>
</body>
</html>
