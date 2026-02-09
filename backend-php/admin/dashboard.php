<?php
require_once __DIR__ . '/../templates/admin-guard.php';

$pdo = db();

// Stats
$totalUsers = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
$totalBooks = (int)$pdo->query("SELECT COUNT(*) FROM books")->fetchColumn();
$totalStorage = (int)$pdo->query("SELECT COALESCE(SUM(file_size), 0) FROM books")->fetchColumn();
$recentUsers = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE created_at >= datetime('now', '-7 days')")->fetchColumn();

// Ultimos 10 usuarios
$latestUsers = $pdo->query("SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 10")->fetchAll();

// Ultimos 10 libros
$latestBooks = $pdo->query("
    SELECT b.id, b.title, b.author, b.file_type, b.file_size, b.created_at, u.username
    FROM books b JOIN users u ON b.user_id = u.id
    ORDER BY b.created_at DESC LIMIT 10
")->fetchAll();

$pageTitle = 'Dashboard';
require_once __DIR__ . '/../templates/admin-layout.php';
?>

<h1 class="text-xl md:text-2xl font-bold mb-6">Dashboard</h1>

<!-- Stats Grid -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <div class="stat-card">
        <div class="text-klio-muted text-xs font-medium uppercase tracking-wider">Total Usuarios</div>
        <div class="text-2xl font-bold mt-1"><?php echo $totalUsers; ?></div>
        <div class="text-klio-muted text-xs mt-1">+<?php echo $recentUsers; ?> esta semana</div>
    </div>
    <div class="stat-card">
        <div class="text-klio-muted text-xs font-medium uppercase tracking-wider">Libros Subidos</div>
        <div class="text-2xl font-bold mt-1"><?php echo $totalBooks; ?></div>
    </div>
    <div class="stat-card">
        <div class="text-klio-muted text-xs font-medium uppercase tracking-wider">Almacenamiento</div>
        <div class="text-2xl font-bold mt-1"><?php echo format_bytes($totalStorage); ?></div>
    </div>
    <div class="stat-card">
        <div class="text-klio-muted text-xs font-medium uppercase tracking-wider">Nuevos (7 dias)</div>
        <div class="text-2xl font-bold mt-1 text-klio-primary"><?php echo $recentUsers; ?></div>
    </div>
</div>

<!-- Tables -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Ultimos usuarios -->
    <div class="bg-klio-card border border-klio-border rounded-xl overflow-x-auto">
        <div class="px-5 py-4 border-b border-klio-border flex justify-between items-center">
            <h2 class="font-semibold text-sm">Ultimos Usuarios</h2>
            <a href="<?php echo base_url('admin/users.php'); ?>" class="text-klio-primary text-xs hover:underline">Ver todos</a>
        </div>
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Usuario</th>
                    <th>Role</th>
                    <th>Fecha</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($latestUsers as $u): ?>
                <tr>
                    <td>
                        <div class="font-medium"><?php echo e($u['username']); ?></div>
                        <div class="text-klio-muted text-xs"><?php echo e($u['email']); ?></div>
                    </td>
                    <td>
                        <span class="px-2 py-0.5 rounded-full text-xs <?php echo $u['role'] === 'admin' ? 'bg-klio-primary/15 text-klio-primary' : 'bg-klio-elevated text-klio-muted'; ?>">
                            <?php echo e($u['role']); ?>
                        </span>
                    </td>
                    <td class="text-klio-muted text-xs"><?php echo e(substr($u['created_at'], 0, 10)); ?></td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($latestUsers)): ?>
                <tr><td colspan="3" class="text-center text-klio-muted py-6">Sin usuarios aun</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>

    <!-- Ultimos libros -->
    <div class="bg-klio-card border border-klio-border rounded-xl overflow-x-auto">
        <div class="px-5 py-4 border-b border-klio-border">
            <h2 class="font-semibold text-sm">Ultimos Libros</h2>
        </div>
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Libro</th>
                    <th>Usuario</th>
                    <th>Tamano</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($latestBooks as $b): ?>
                <tr>
                    <td>
                        <div class="font-medium"><?php echo e($b['title']); ?></div>
                        <div class="text-klio-muted text-xs"><?php echo e($b['author']); ?> &middot; <?php echo strtoupper($b['file_type']); ?></div>
                    </td>
                    <td class="text-sm"><?php echo e($b['username']); ?></td>
                    <td class="text-klio-muted text-xs"><?php echo format_bytes($b['file_size']); ?></td>
                    <td class="text-xs">
                        <a href="<?php echo base_url('admin/download.php?id=' . $b['id']); ?>" class="text-klio-primary hover:underline" title="Descargar">&#x21E9;</a>
                        <button onclick="copyLink(<?php echo $b['id']; ?>)" class="ml-1 text-klio-muted hover:text-klio-text" title="Copiar enlace">&#x1F4CB;</button>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($latestBooks)): ?>
                <tr><td colspan="4" class="text-center text-klio-muted py-6">Sin libros aun</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<script>
function copyLink(bookId) {
    var url = window.location.origin + '<?php echo base_url("admin/download.php?id="); ?>' + bookId;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function() {
            showToast('Enlace copiado');
        });
    } else {
        var ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Enlace copiado');
    }
}
function showToast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.className = 'fixed bottom-4 right-4 bg-klio-primary text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50';
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2000);
}
</script>

    </main>
</div>
</body>
</html>
