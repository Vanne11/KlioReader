<?php require_once __DIR__ . '/base.php'; ?>
<script src="<?php echo base_url('assets/js/admin.js'); ?>" defer></script>

<div class="flex min-h-screen">
    <!-- Overlay movil -->
    <div id="sidebarOverlay" class="fixed inset-0 bg-black/50 z-30 hidden md:hidden" onclick="toggleSidebar()"></div>

    <!-- Sidebar -->
    <aside id="sidebar" class="w-60 bg-klio-card border-r border-klio-border flex flex-col fixed h-full z-40 transition-transform duration-200 -translate-x-full md:translate-x-0">
        <div class="p-5 border-b border-klio-border flex items-center justify-between">
            <div>
                <a href="<?php echo base_url('admin/dashboard.php'); ?>" class="text-lg font-bold text-klio-primary">KlioReader</a>
                <div class="text-xs text-klio-muted mt-1">Panel de Administracion</div>
            </div>
            <button onclick="toggleSidebar()" class="md:hidden text-klio-muted hover:text-klio-text p-1">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <nav class="flex-1 p-4 space-y-1 overflow-y-auto">
            <?php
            $currentPage = basename($_SERVER['SCRIPT_NAME']);
            $navItems = array(
                array('dashboard.php', 'Dashboard', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/>'),
                array('users.php', 'Usuarios', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>'),
                array('settings.php', 'Configuracion', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>'),
                array('migrations.php', 'Migraciones', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16M8 11h.01M8 15h.01M12 11h4M12 15h4"/>'),
            );
            foreach ($navItems as $item):
                $isActive = ($currentPage === $item[0]);
            ?>
            <a href="<?php echo base_url('admin/' . $item[0]); ?>" onclick="closeSidebarMobile()" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors <?php echo $isActive ? 'bg-klio-primary/15 text-klio-primary' : 'text-klio-muted hover:text-klio-text hover:bg-klio-elevated'; ?>">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><?php echo $item[2]; ?></svg>
                <?php echo $item[1]; ?>
            </a>
            <?php endforeach; ?>
        </nav>
        <div class="p-4 border-t border-klio-border">
            <div class="text-sm text-klio-muted mb-2"><?php echo e($_SESSION['admin_username'] ?? 'Admin'); ?></div>
            <a href="<?php echo base_url('admin/logout.php'); ?>" class="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                Cerrar sesion
            </a>
        </div>
    </aside>

    <!-- Content -->
    <main class="flex-1 md:ml-60 p-4 md:p-8">
        <!-- Header movil -->
        <div class="flex items-center gap-3 mb-4 md:hidden">
            <button onclick="toggleSidebar()" class="p-2 rounded-lg bg-klio-card border border-klio-border text-klio-muted hover:text-klio-text">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <span class="text-sm font-semibold text-klio-primary">KlioReader</span>
        </div>

        <?php
        $flashSuccess = flash('success');
        $flashError = flash('error');
        if ($flashSuccess): ?>
        <div class="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm"><?php echo e($flashSuccess); ?></div>
        <?php endif; ?>
        <?php if ($flashError): ?>
        <div class="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"><?php echo e($flashError); ?></div>
        <?php endif; ?>
