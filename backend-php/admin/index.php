<?php
require_once __DIR__ . '/../templates/functions.php';

if (session_status() === PHP_SESSION_NONE) session_start();

// Si ya esta logueado, redirigir al dashboard
if (!empty($_SESSION['admin_id'])) {
    redirect(base_url('admin/dashboard.php'));
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $login = trim(isset($_POST['login']) ? $_POST['login'] : '');
    $password = isset($_POST['password']) ? $_POST['password'] : '';

    if ($login && $password) {
        $stmt = db()->prepare("SELECT id, username, password_hash, role FROM users WHERE (email = ? OR username = ?) AND role = 'admin'");
        $stmt->execute(array($login, $login));
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password_hash'])) {
            $_SESSION['admin_id'] = (int)$user['id'];
            $_SESSION['admin_username'] = $user['username'];
            redirect(base_url('admin/dashboard.php'));
        } else {
            $error = 'Credenciales incorrectas o usuario no es administrador.';
        }
    } else {
        $error = 'Completa todos los campos.';
    }
}

$pageTitle = 'Admin Login';
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin - KlioReader</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
    tailwind.config = {
        theme: {
            extend: {
                colors: {
                    klio: {
                        bg: '#0f0f14',
                        card: '#16161e',
                        elevated: '#1c1c26',
                        primary: 'hsl(265, 89%, 78%)',
                        accent: 'hsl(326, 100%, 74%)',
                        text: '#cdd6f4',
                        muted: '#6c7086',
                        border: 'rgba(255,255,255,0.08)',
                    }
                },
                fontFamily: {
                    sans: ['Inter', 'system-ui', 'sans-serif'],
                }
            }
        }
    }
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body class="bg-klio-bg text-klio-text font-sans min-h-screen flex items-center justify-center antialiased">
    <div class="w-full max-w-sm px-6">
        <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-klio-primary">KlioReader</h1>
            <p class="text-klio-muted text-sm mt-1">Panel de Administracion</p>
        </div>

        <div class="bg-klio-card border border-klio-border rounded-xl p-6">
            <?php if ($error): ?>
            <div class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <?php echo e($error); ?>
            </div>
            <?php endif; ?>

            <form method="POST" class="space-y-4">
                <div>
                    <label class="block text-xs font-medium text-klio-muted mb-1.5">Email o Username</label>
                    <input type="text" name="login" required autofocus
                        class="w-full px-3 py-2.5 rounded-lg bg-klio-elevated border border-klio-border text-klio-text text-sm outline-none focus:border-klio-primary transition-colors"
                        value="<?php echo e(isset($_POST['login']) ? $_POST['login'] : ''); ?>">
                </div>
                <div>
                    <label class="block text-xs font-medium text-klio-muted mb-1.5">Password</label>
                    <input type="password" name="password" required
                        class="w-full px-3 py-2.5 rounded-lg bg-klio-elevated border border-klio-border text-klio-text text-sm outline-none focus:border-klio-primary transition-colors">
                </div>
                <button type="submit"
                    class="w-full py-2.5 rounded-lg bg-klio-primary text-klio-bg font-semibold text-sm hover:opacity-90 transition-opacity">
                    Iniciar Sesion
                </button>
            </form>
        </div>

        <div class="text-center mt-6">
            <a href="<?php echo base_url(); ?>" class="text-klio-muted text-sm hover:text-klio-text transition-colors">&larr; Volver al sitio</a>
        </div>
    </div>
</body>
</html>
