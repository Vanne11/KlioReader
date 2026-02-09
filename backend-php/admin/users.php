<?php
require_once __DIR__ . '/../templates/admin-guard.php';
require_once __DIR__ . '/../templates/csrf.php';

$pdo = db();

// Eliminar usuario
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    if ($_POST['action'] === 'delete' && isset($_POST['user_id'])) {
        $userId = (int)$_POST['user_id'];
        // No permitir eliminar al propio admin
        if ($userId === (int)$_SESSION['admin_id']) {
            flash('error', 'No puedes eliminarte a ti mismo.');
        } else {
            // Eliminar archivos del usuario
            $uploadsDir = dirname(__DIR__) . '/uploads/' . $userId;
            if (is_dir($uploadsDir)) {
                $files = glob($uploadsDir . '/*');
                if ($files) array_map('unlink', $files);
                rmdir($uploadsDir);
            }
            $pdo->prepare('DELETE FROM users WHERE id = ?')->execute(array($userId));
            flash('success', 'Usuario eliminado.');
        }
        redirect(base_url('admin/users.php'));
    }

    if ($_POST['action'] === 'create') {
        $username = trim($_POST['username'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';
        $role = in_array($_POST['role'] ?? '', array('user', 'admin')) ? $_POST['role'] : 'user';

        if (strlen($username) < 3 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 6) {
            flash('error', 'Username (min 3), email valido y password (min 6) requeridos.');
        } else {
            try {
                $hash = password_hash($password, PASSWORD_BCRYPT);
                $stmt = $pdo->prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)');
                $stmt->execute(array($username, $email, $hash, $role));
                flash('success', 'Usuario creado exitosamente.');
            } catch (PDOException $e) {
                flash('error', 'El username o email ya existe.');
            }
        }
        redirect(base_url('admin/users.php'));
    }
}

// Paginacion y busqueda
$search = isset($_GET['q']) ? trim($_GET['q']) : '';
$page = max(1, (int)(isset($_GET['page']) ? $_GET['page'] : 1));
$perPage = 15;
$offset = ($page - 1) * $perPage;

$whereClause = '';
$params = array();
if ($search) {
    $whereClause = "WHERE u.username LIKE ? OR u.email LIKE ?";
    $params = array('%' . $search . '%', '%' . $search . '%');
}

// Total
$countSql = "SELECT COUNT(*) FROM users u $whereClause";
$stmt = $pdo->prepare($countSql);
$stmt->execute($params);
$total = (int)$stmt->fetchColumn();
$totalPages = max(1, ceil($total / $perPage));

// Usuarios
$sql = "SELECT u.id, u.username, u.email, u.role, u.is_subscriber, u.upload_limit, u.storage_used, u.xp, u.level, u.streak, u.created_at,
        (SELECT COUNT(*) FROM books WHERE user_id = u.id) as book_count
        FROM users u $whereClause ORDER BY u.created_at DESC LIMIT $perPage OFFSET $offset";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$users = $stmt->fetchAll();

$pageTitle = 'Usuarios';
require_once __DIR__ . '/../templates/admin-layout.php';
?>

<div class="flex items-center justify-between mb-6 gap-3">
    <h1 class="text-xl md:text-2xl font-bold">Usuarios</h1>
    <button onclick="document.getElementById('createModal').classList.remove('hidden')" class="btn-primary whitespace-nowrap text-xs md:text-sm">+ Nuevo</button>
</div>

<!-- Busqueda -->
<form method="GET" class="mb-6">
    <div class="flex flex-col sm:flex-row gap-3">
        <input type="text" name="q" placeholder="Buscar por username o email..." value="<?php echo e($search); ?>"
            class="form-input flex-1 sm:max-w-md">
        <div class="flex gap-2">
            <button type="submit" class="btn-secondary">Buscar</button>
            <?php if ($search): ?>
            <a href="<?php echo base_url('admin/users.php'); ?>" class="btn-secondary">Limpiar</a>
            <?php endif; ?>
        </div>
    </div>
</form>

<!-- Tabla -->
<div class="bg-klio-card border border-klio-border rounded-xl overflow-x-auto">
    <table class="admin-table">
        <thead>
            <tr>
                <th>ID</th>
                <th>Usuario</th>
                <th>Role</th>
                <th>Libros</th>
                <th>XP / Nivel</th>
                <th>Racha</th>
                <th>Almacenamiento</th>
                <th>Fecha</th>
                <th>Acciones</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($users as $u): ?>
            <tr>
                <td class="text-klio-muted"><?php echo $u['id']; ?></td>
                <td>
                    <div class="font-medium">
                        <?php echo e($u['username']); ?>
                        <?php if ((int)$u['is_subscriber']): ?>
                        <span class="text-amber-400 ml-1" title="Suscriptor Cloud">&#x1F451;</span>
                        <?php endif; ?>
                    </div>
                    <div class="text-klio-muted text-xs"><?php echo e($u['email']); ?></div>
                </td>
                <td>
                    <span class="px-2 py-0.5 rounded-full text-xs <?php echo $u['role'] === 'admin' ? 'bg-klio-primary/15 text-klio-primary' : 'bg-klio-elevated text-klio-muted'; ?>">
                        <?php echo e($u['role']); ?>
                    </span>
                </td>
                <td><?php echo (int)$u['book_count']; ?></td>
                <td>
                    <span class="text-yellow-400 font-bold"><?php echo (int)$u['xp']; ?></span>
                    <span class="text-klio-muted text-xs">/ Nv<?php echo (int)$u['level']; ?></span>
                </td>
                <td>
                    <?php if ((int)$u['streak'] > 0): ?>
                    <span class="text-orange-400 font-bold"><?php echo (int)$u['streak']; ?>d</span>
                    <?php else: ?>
                    <span class="text-klio-muted">0</span>
                    <?php endif; ?>
                </td>
                <td>
                    <div class="text-xs"><?php echo format_bytes($u['storage_used']); ?> / <?php echo format_bytes($u['upload_limit']); ?></div>
                    <?php $pct = $u['upload_limit'] > 0 ? min(100, round(($u['storage_used'] / $u['upload_limit']) * 100)) : 0; ?>
                    <div class="w-20 h-1.5 bg-klio-elevated rounded-full mt-1">
                        <div class="progress-bar" style="width: <?php echo $pct; ?>%"></div>
                    </div>
                </td>
                <td class="text-klio-muted text-xs"><?php echo e(substr($u['created_at'], 0, 10)); ?></td>
                <td>
                    <div class="flex gap-2">
                        <a href="<?php echo base_url('admin/user-detail.php?id=' . $u['id']); ?>" class="text-blue-400 text-xs hover:underline">Ver</a>
                        <a href="<?php echo base_url('admin/user-edit.php?id=' . $u['id']); ?>" class="text-klio-primary text-xs hover:underline">Editar</a>
                        <?php if ((int)$u['id'] !== (int)$_SESSION['admin_id']): ?>
                        <form method="POST" class="inline" onsubmit="return confirm('Eliminar usuario <?php echo e($u['username']); ?>?')">
                            <?php echo csrf_field(); ?>
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="user_id" value="<?php echo $u['id']; ?>">
                            <button type="submit" class="text-red-400 text-xs hover:underline">Eliminar</button>
                        </form>
                        <?php endif; ?>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php if (empty($users)): ?>
            <tr><td colspan="9" class="text-center text-klio-muted py-8">No se encontraron usuarios.</td></tr>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<!-- Paginacion -->
<?php if ($totalPages > 1): ?>
<div class="flex justify-center gap-2 mt-6">
    <?php for ($i = 1; $i <= $totalPages; $i++): ?>
    <a href="?page=<?php echo $i; ?><?php echo $search ? '&q=' . urlencode($search) : ''; ?>"
       class="px-3 py-1.5 rounded-lg text-sm <?php echo $i === $page ? 'bg-klio-primary text-klio-bg font-semibold' : 'bg-klio-card border border-klio-border text-klio-muted hover:text-klio-text'; ?>">
        <?php echo $i; ?>
    </a>
    <?php endfor; ?>
</div>
<?php endif; ?>

<!-- Modal Crear Usuario -->
<div id="createModal" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-klio-card border border-klio-border rounded-xl w-full max-w-md p-6 mx-4">
        <h2 class="text-lg font-semibold mb-4">Crear Usuario</h2>
        <form method="POST" class="space-y-4">
            <?php echo csrf_field(); ?>
            <input type="hidden" name="action" value="create">
            <div>
                <label class="form-label">Username</label>
                <input type="text" name="username" required minlength="3" class="form-input">
            </div>
            <div>
                <label class="form-label">Email</label>
                <input type="email" name="email" required class="form-input">
            </div>
            <div>
                <label class="form-label">Password</label>
                <input type="password" name="password" required minlength="6" class="form-input">
            </div>
            <div>
                <label class="form-label">Role</label>
                <select name="role" class="form-input">
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                </select>
            </div>
            <div class="flex justify-end gap-3 pt-2">
                <button type="button" onclick="document.getElementById('createModal').classList.add('hidden')" class="btn-secondary">Cancelar</button>
                <button type="submit" class="btn-primary">Crear</button>
            </div>
        </form>
    </div>
</div>

    </main>
</div>
</body>
</html>
