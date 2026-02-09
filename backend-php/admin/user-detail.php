<?php
require_once __DIR__ . '/../templates/admin-guard.php';
require_once __DIR__ . '/../templates/csrf.php';

$pdo = db();
$userId = (int)(isset($_GET['id']) ? $_GET['id'] : 0);

if (!$userId) {
    redirect(base_url('admin/users.php'));
}

// Acciones POST
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    verify_csrf();

    if ($_POST['action'] === 'reset_stats') {
        $pdo->prepare('UPDATE users SET xp = 0, level = 1, streak = 0, last_streak_date = NULL, selected_title_id = NULL WHERE id = ?')
            ->execute(array($userId));
        flash('success', 'Stats de gamificacion reseteados a cero.');
        redirect(base_url('admin/user-detail.php?id=' . $userId));
    }

    if ($_POST['action'] === 'update_stats') {
        $xp = max(0, (int)($_POST['xp'] ?? 0));
        $level = max(1, (int)($_POST['level'] ?? 1));
        $streak = max(0, (int)($_POST['streak'] ?? 0));
        $pdo->prepare('UPDATE users SET xp = ?, level = ?, streak = ? WHERE id = ?')
            ->execute(array($xp, $level, $streak, $userId));
        flash('success', 'Stats actualizados.');
        redirect(base_url('admin/user-detail.php?id=' . $userId));
    }
}

// Obtener usuario
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute(array($userId));
$user = $stmt->fetch();

if (!$user) {
    flash('error', 'Usuario no encontrado.');
    redirect(base_url('admin/users.php'));
}

// Libros del usuario
$stmt = $pdo->prepare('
    SELECT b.id, b.title, b.author, b.file_type, b.file_size, b.total_chapters, b.created_at,
           COALESCE(rp.progress_percent, 0) as progress_percent,
           COALESCE(rp.current_chapter, 0) as current_chapter,
           rp.last_read,
           sf.file_hash as md5
    FROM books b
    LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = b.user_id
    LEFT JOIN stored_files sf ON sf.id = b.stored_file_id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
');
$stmt->execute(array($userId));
$books = $stmt->fetchAll();

// Contadores
$totalBooks = count($books);
$completedBooks = 0;
$inProgressBooks = 0;
foreach ($books as $b) {
    $pct = (int)$b['progress_percent'];
    if ($pct >= 100) $completedBooks++;
    elseif ($pct > 0) $inProgressBooks++;
}

$stmt = $pdo->prepare('SELECT COUNT(*) FROM notes WHERE user_id = ?');
$stmt->execute(array($userId));
$totalNotes = (int)$stmt->fetchColumn();

$stmt = $pdo->prepare('SELECT COUNT(*) FROM bookmarks WHERE user_id = ?');
$stmt->execute(array($userId));
$totalBookmarks = (int)$stmt->fetchColumn();

$pageTitle = 'Detalle: ' . $user['username'];
require_once __DIR__ . '/../templates/admin-layout.php';
?>

<div class="flex items-center gap-3 mb-6 flex-wrap">
    <a href="<?php echo base_url('admin/users.php'); ?>" class="text-klio-muted hover:text-klio-text transition-colors">&larr;</a>
    <h1 class="text-xl md:text-2xl font-bold">Detalle de Usuario</h1>
    <a href="<?php echo base_url('admin/user-edit.php?id=' . $userId); ?>" class="ml-auto text-klio-primary text-sm hover:underline">Editar &rarr;</a>
</div>

<!-- Info Principal -->
<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
    <!-- Perfil -->
    <div class="bg-klio-card border border-klio-border rounded-xl p-6">
        <div class="flex items-center gap-4 mb-4">
            <div class="w-14 h-14 rounded-full bg-klio-primary/15 flex items-center justify-center text-klio-primary text-xl font-bold">
                <?php echo strtoupper(substr($user['username'], 0, 1)); ?>
            </div>
            <div>
                <h2 class="text-lg font-bold"><?php echo e($user['username']); ?></h2>
                <div class="text-klio-muted text-xs"><?php echo e($user['email']); ?></div>
                <span class="inline-block mt-1 px-2 py-0.5 rounded-full text-xs <?php echo $user['role'] === 'admin' ? 'bg-klio-primary/15 text-klio-primary' : 'bg-klio-elevated text-klio-muted'; ?>">
                    <?php echo e($user['role']); ?>
                </span>
            </div>
        </div>
        <div class="space-y-2 text-sm border-t border-klio-border pt-4">
            <div class="flex justify-between"><span class="text-klio-muted">ID</span><span class="font-mono"><?php echo $user['id']; ?></span></div>
            <div class="flex justify-between"><span class="text-klio-muted">Creado</span><span><?php echo e(substr($user['created_at'], 0, 16)); ?></span></div>
            <div class="flex justify-between"><span class="text-klio-muted">Actualizado</span><span><?php echo e(substr($user['updated_at'], 0, 16)); ?></span></div>
            <div class="flex justify-between"><span class="text-klio-muted">Suscriptor</span><span class="<?php echo (int)$user['is_subscriber'] ? 'text-amber-400 font-bold' : 'text-klio-muted'; ?>"><?php echo (int)$user['is_subscriber'] ? 'Sí' : 'No'; ?></span></div>
            <div class="flex justify-between"><span class="text-klio-muted">Titulo</span><span class="font-mono text-xs"><?php echo $user['selected_title_id'] ? e($user['selected_title_id']) : '<span class="text-klio-muted">ninguno</span>'; ?></span></div>
        </div>
    </div>

    <!-- Gamificacion -->
    <div class="bg-klio-card border border-klio-border rounded-xl p-6">
        <h3 class="text-sm font-bold uppercase tracking-wider text-klio-muted mb-4">Gamificacion</h3>
        <div class="grid grid-cols-3 gap-4 mb-4">
            <div class="text-center">
                <div class="text-2xl font-black text-yellow-400"><?php echo (int)$user['xp']; ?></div>
                <div class="text-[10px] text-klio-muted uppercase tracking-wider">XP</div>
            </div>
            <div class="text-center">
                <div class="text-2xl font-black text-klio-primary"><?php echo (int)$user['level']; ?></div>
                <div class="text-[10px] text-klio-muted uppercase tracking-wider">Nivel</div>
            </div>
            <div class="text-center">
                <div class="text-2xl font-black text-orange-400"><?php echo (int)$user['streak']; ?></div>
                <div class="text-[10px] text-klio-muted uppercase tracking-wider">Racha</div>
            </div>
        </div>
        <div class="space-y-2 text-sm border-t border-klio-border pt-4">
            <div class="flex justify-between"><span class="text-klio-muted">XP (raw)</span><span class="font-mono text-xs"><?php echo e($user['xp']); ?></span></div>
            <div class="flex justify-between"><span class="text-klio-muted">Level (raw)</span><span class="font-mono text-xs"><?php echo e($user['level']); ?></span></div>
            <div class="flex justify-between"><span class="text-klio-muted">Streak (raw)</span><span class="font-mono text-xs"><?php echo e($user['streak']); ?></span></div>
            <div class="flex justify-between"><span class="text-klio-muted">Last streak</span><span class="font-mono text-xs"><?php echo $user['last_streak_date'] ? e($user['last_streak_date']) : '-'; ?></span></div>
        </div>

        <!-- Editar Stats -->
        <form method="POST" class="border-t border-klio-border pt-4 mt-4 space-y-3">
            <?php echo csrf_field(); ?>
            <input type="hidden" name="action" value="update_stats">
            <div class="grid grid-cols-3 gap-2">
                <div>
                    <label class="text-[10px] text-klio-muted uppercase">XP</label>
                    <input type="number" name="xp" value="<?php echo (int)$user['xp']; ?>" min="0" class="form-input text-sm py-1">
                </div>
                <div>
                    <label class="text-[10px] text-klio-muted uppercase">Nivel</label>
                    <input type="number" name="level" value="<?php echo (int)$user['level']; ?>" min="1" class="form-input text-sm py-1">
                </div>
                <div>
                    <label class="text-[10px] text-klio-muted uppercase">Racha</label>
                    <input type="number" name="streak" value="<?php echo (int)$user['streak']; ?>" min="0" class="form-input text-sm py-1">
                </div>
            </div>
            <button type="submit" class="btn-secondary text-xs w-full">Guardar Stats</button>
        </form>

        <!-- Reset -->
        <form method="POST" class="mt-2" onsubmit="return confirm('Resetear TODOS los stats de gamificacion a cero?')">
            <?php echo csrf_field(); ?>
            <input type="hidden" name="action" value="reset_stats">
            <button type="submit" class="w-full py-2 px-3 rounded-lg text-xs text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors">
                Resetear Stats a Cero
            </button>
        </form>
    </div>

    <!-- Almacenamiento -->
    <div class="bg-klio-card border border-klio-border rounded-xl p-6">
        <h3 class="text-sm font-bold uppercase tracking-wider text-klio-muted mb-4">Contenido</h3>
        <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="text-center">
                <div class="text-2xl font-black"><?php echo $totalBooks; ?></div>
                <div class="text-[10px] text-klio-muted uppercase tracking-wider">Libros</div>
            </div>
            <div class="text-center">
                <div class="text-2xl font-black text-green-400"><?php echo $completedBooks; ?></div>
                <div class="text-[10px] text-klio-muted uppercase tracking-wider">Completados</div>
            </div>
            <div class="text-center">
                <div class="text-2xl font-black text-blue-400"><?php echo $inProgressBooks; ?></div>
                <div class="text-[10px] text-klio-muted uppercase tracking-wider">En Progreso</div>
            </div>
            <div class="text-center">
                <div class="text-2xl font-black text-amber-400"><?php echo $totalNotes; ?></div>
                <div class="text-[10px] text-klio-muted uppercase tracking-wider">Notas</div>
            </div>
        </div>
        <div class="space-y-2 text-sm border-t border-klio-border pt-4">
            <div class="flex justify-between"><span class="text-klio-muted">Marcadores</span><span><?php echo $totalBookmarks; ?></span></div>
            <div class="flex justify-between"><span class="text-klio-muted">Almacenamiento</span><span><?php echo format_bytes((int)$user['storage_used']); ?></span></div>
            <div class="flex justify-between"><span class="text-klio-muted">Limite</span><span><?php echo format_bytes((int)$user['upload_limit']); ?></span></div>
            <?php $pct = (int)$user['upload_limit'] > 0 ? min(100, round(((int)$user['storage_used'] / (int)$user['upload_limit']) * 100)) : 0; ?>
            <div class="w-full h-2 bg-klio-elevated rounded-full mt-2">
                <div class="progress-bar" style="width: <?php echo $pct; ?>%"></div>
            </div>
        </div>
    </div>
</div>

<!-- Libros del usuario -->
<div class="bg-klio-card border border-klio-border rounded-xl overflow-x-auto">
    <div class="px-4 md:px-6 py-4 border-b border-klio-border flex items-center justify-between">
        <h3 class="font-bold">Libros (<?php echo $totalBooks; ?>)</h3>
    </div>
    <?php if (empty($books)): ?>
    <div class="py-12 text-center text-klio-muted text-sm">Este usuario no tiene libros.</div>
    <?php else: ?>
    <table class="admin-table">
        <thead>
            <tr>
                <th>ID</th>
                <th>Titulo</th>
                <th>Tipo</th>
                <th>Capitulos</th>
                <th>Progreso</th>
                <th>Tamano</th>
                <th>Ultima lectura</th>
                <th>MD5</th>
                <th>Subido</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($books as $b): ?>
            <tr>
                <td class="text-klio-muted font-mono text-xs"><?php echo $b['id']; ?></td>
                <td>
                    <div class="font-medium text-sm max-w-[250px] truncate"><?php echo e($b['title']); ?></div>
                    <div class="text-klio-muted text-xs"><?php echo e($b['author']); ?></div>
                </td>
                <td>
                    <span class="px-2 py-0.5 rounded text-xs bg-klio-elevated"><?php echo strtoupper(e($b['file_type'])); ?></span>
                </td>
                <td class="text-sm">
                    <?php echo (int)$b['current_chapter']; ?> / <?php echo (int)$b['total_chapters']; ?>
                </td>
                <td>
                    <?php $pct = (int)$b['progress_percent']; ?>
                    <div class="flex items-center gap-2">
                        <div class="w-16 h-1.5 bg-klio-elevated rounded-full">
                            <div class="h-full rounded-full <?php echo $pct >= 100 ? 'bg-green-400' : ($pct > 0 ? 'bg-amber-400' : 'bg-klio-muted/20'); ?>" style="width: <?php echo min(100, $pct); ?>%"></div>
                        </div>
                        <span class="text-xs font-bold <?php echo $pct >= 100 ? 'text-green-400' : ''; ?>"><?php echo $pct; ?>%</span>
                    </div>
                </td>
                <td class="text-klio-muted text-xs"><?php echo format_bytes((int)$b['file_size']); ?></td>
                <td class="text-klio-muted text-xs"><?php echo $b['last_read'] ? e(substr($b['last_read'], 0, 16)) : '-'; ?></td>
                <td class="text-klio-muted font-mono text-xs select-all"><?php echo $b['md5'] ? e($b['md5']) : '-'; ?></td>
                <td class="text-klio-muted text-xs"><?php echo e(substr($b['created_at'], 0, 10)); ?></td>
                <td class="text-xs whitespace-nowrap">
                    <a href="<?php echo base_url('admin/download.php?id=' . $b['id']); ?>" class="text-klio-primary hover:underline" title="Descargar">&#x21E9;</a>
                    <button onclick="copyLink(<?php echo $b['id']; ?>)" class="ml-1 text-klio-muted hover:text-klio-text" title="Copiar enlace">&#x1F4CB;</button>
                </td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <?php endif; ?>
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
