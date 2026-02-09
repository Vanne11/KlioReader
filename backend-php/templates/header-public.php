<?php $currentLang = current_lang(); ?>
<header class="border-b border-klio-border backdrop-blur-md bg-klio-bg/80 sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="<?php echo base_url(); ?>" class="flex items-center gap-2 text-xl font-bold text-klio-primary tracking-tight">
            <img src="<?php echo base_url('assets/img/logo.png'); ?>" alt="KlioReader" class="w-8 h-8">
            KlioReader
        </a>
        <nav class="flex items-center gap-4 md:gap-6">
            <a href="<?php echo base_url(); ?>" class="text-klio-muted hover:text-klio-text transition-colors text-sm hidden sm:inline"><?php echo e(t('nav_home')); ?></a>
            <a href="<?php echo base_url('download.php'); ?>" class="text-klio-muted hover:text-klio-text transition-colors text-sm"><?php echo e(t('nav_downloads')); ?></a>

            <!-- Selector de idioma -->
            <div class="relative" id="langWrapper">
                <button type="button" id="langBtn" class="flex items-center gap-1.5 text-klio-muted hover:text-klio-text transition-colors" title="Language">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z"/>
                    </svg>
                    <span class="text-xs font-medium hidden sm:inline"><?php echo strtoupper($currentLang); ?></span>
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <div id="langDropdown" class="hidden absolute right-0 top-full mt-2 w-40 py-1 rounded-lg bg-klio-card border border-klio-border shadow-xl z-[60]">
                    <?php
                    $langs = array(
                        'es' => 'Espanol',
                        'en' => 'English',
                    );
                    foreach ($langs as $code => $name):
                        $active = $code === $currentLang;
                    ?>
                    <a href="?lang=<?php echo $code; ?>" class="block px-3 py-2 text-sm transition-colors <?php echo $active ? 'text-klio-primary bg-klio-primary/10' : 'text-klio-muted hover:text-klio-text hover:bg-klio-elevated'; ?>">
                        <?php echo e($name); ?>
                    </a>
                    <?php endforeach; ?>
                </div>
            </div>

            <a href="<?php echo base_url('admin/'); ?>" class="text-sm px-4 py-2 rounded-lg bg-klio-primary/10 text-klio-primary hover:bg-klio-primary/20 transition-colors"><?php echo e(t('nav_admin')); ?></a>
        </nav>
    </div>
</header>

<script>
(function() {
    var btn = document.getElementById('langBtn');
    var dropdown = document.getElementById('langDropdown');
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', function() {
        dropdown.classList.add('hidden');
    });
})();
</script>
