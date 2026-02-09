<?php
require_once __DIR__ . '/templates/functions.php';

$siteName = get_setting('site_name', 'KlioReader');
$heroTitle = t('hero_title');
$heroSubtitle = t('hero_subtitle');

// Obtener ultima release de GitHub (cache)
$latestRelease = null;
$cacheFile = __DIR__ . '/data/github_releases_cache.json';
$cacheTTL = 600; // 10 min

if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTTL) {
    $cached = json_decode(file_get_contents($cacheFile), true);
    if ($cached && isset($cached[0])) $latestRelease = $cached[0];
} else {
    $ctx = stream_context_create(array('http' => array(
        'header' => "User-Agent: KlioReader-Web\r\n",
        'timeout' => 5,
    )));
    $json = @file_get_contents('https://api.github.com/repos/Vanne11/KlioReader/releases', false, $ctx);
    if ($json) {
        $releases = json_decode($json, true);
        if ($releases && is_array($releases)) {
            @file_put_contents($cacheFile, $json);
            if (isset($releases[0])) $latestRelease = $releases[0];
        }
    }
}

$pageTitle = '';
require_once __DIR__ . '/templates/base.php';
require_once __DIR__ . '/templates/header-public.php';

$featureKeys = array(
    array('feature_books_title', 'feature_books_desc', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>'),
    array('feature_comics_title', 'feature_comics_desc', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>'),
    array('feature_cloud_title', 'feature_cloud_desc', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>'),
    array('feature_notes_title', 'feature_notes_desc', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>'),
    array('feature_progress_title', 'feature_progress_desc', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>'),
    array('feature_gamification_title', 'feature_gamification_desc', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>'),
    array('feature_desktop_title', 'feature_desktop_desc', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>'),
);
?>

<!-- Hero -->
<section class="hero-gradient relative overflow-hidden">
    <div class="max-w-6xl mx-auto px-6 py-24 md:py-32 text-center">
        <img src="<?php echo base_url('assets/img/logo.png'); ?>" alt="KlioReader" class="w-24 h-24 mx-auto mb-6 animate-fade-in-up drop-shadow-lg">
        <h1 class="font-serif text-4xl md:text-6xl font-bold leading-tight animate-fade-in-up">
            <span class="gradient-text"><?php echo e($heroTitle); ?></span>
        </h1>
        <p class="text-klio-muted text-lg md:text-xl mt-6 max-w-2xl mx-auto animate-fade-in-up animate-delay-100">
            <?php echo e($heroSubtitle); ?>
        </p>
        <div class="flex flex-wrap justify-center gap-4 mt-10 animate-fade-in-up animate-delay-200">
            <a href="<?php echo base_url('download.php'); ?>" class="px-6 py-3 rounded-lg bg-klio-primary text-klio-bg font-semibold hover:opacity-90 transition-opacity">
                <?php echo e(t('btn_download_app')); ?>
            </a>
            <a href="https://github.com/Vanne11/KlioReader" target="_blank" rel="noopener" class="px-6 py-3 rounded-lg border border-klio-border text-klio-text hover:bg-klio-card transition-colors">
                <?php echo e(t('btn_view_github')); ?>
            </a>
        </div>
    </div>
</section>

<!-- Caracteristicas -->
<section class="py-20">
    <div class="max-w-6xl mx-auto px-6">
        <h2 class="text-2xl md:text-3xl font-bold text-center mb-4"><?php echo e(t('section_features')); ?></h2>
        <p class="text-klio-muted text-center mb-12 max-w-xl mx-auto"><?php echo e(t('features_desc')); ?></p>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <?php foreach ($featureKeys as $i => $f): ?>
            <div class="glass glass-hover rounded-xl p-6 animate-fade-in-up animate-delay-<?php echo ($i % 3 + 1) * 100; ?>">
                <div class="w-10 h-10 rounded-lg bg-klio-primary/10 flex items-center justify-center mb-4">
                    <svg class="w-5 h-5 text-klio-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><?php echo $f[2]; ?></svg>
                </div>
                <h3 class="font-semibold mb-2"><?php echo e(t($f[0])); ?></h3>
                <p class="text-klio-muted text-sm leading-relaxed"><?php echo e(t($f[1])); ?></p>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<!-- Ultima version -->
<?php if ($latestRelease): ?>
<section class="py-16">
    <div class="max-w-3xl mx-auto px-6">
        <div class="glass rounded-xl p-8 text-center glow-primary">
            <div class="text-klio-muted text-xs uppercase tracking-wider mb-2"><?php echo e(t('latest_version')); ?></div>
            <h2 class="text-2xl font-bold gradient-text mb-2"><?php echo e($latestRelease['tag_name'] ?? ''); ?></h2>
            <p class="text-klio-muted text-sm mb-6"><?php echo e($latestRelease['name'] ?? ''); ?></p>
            <a href="<?php echo base_url('download.php'); ?>" class="inline-block px-6 py-3 rounded-lg bg-klio-primary text-klio-bg font-semibold hover:opacity-90 transition-opacity">
                <?php echo e(t('btn_view_downloads')); ?>
            </a>
        </div>
    </div>
</section>
<?php endif; ?>

<?php require_once __DIR__ . '/templates/footer-public.php'; ?>
