<footer class="border-t border-klio-border mt-20">
    <div class="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="text-klio-muted text-sm">
            &copy; <?php echo date('Y'); ?> <?php echo e(get_setting('site_name', 'KlioReader')); ?>
        </div>
        <div class="flex items-center gap-6">
            <a href="https://github.com/Vanne11/KlioReader" target="_blank" rel="noopener" class="text-klio-muted hover:text-klio-text transition-colors text-sm">GitHub</a>
            <a href="<?php echo base_url('download.php'); ?>" class="text-klio-muted hover:text-klio-text transition-colors text-sm">Descargas</a>
        </div>
    </div>
</footer>
</body>
</html>
