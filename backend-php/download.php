<?php
require_once __DIR__ . '/templates/functions.php';

// Obtener releases de GitHub con cache
$releases = array();
$cacheFile = __DIR__ . '/data/github_releases_cache.json';
$cacheTTL = 600; // 10 min
$fetchError = false;

if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTTL) {
    $releases = json_decode(file_get_contents($cacheFile), true);
    if (!is_array($releases)) $releases = array();
} else {
    $ctx = stream_context_create(array('http' => array(
        'header' => "User-Agent: KlioReader-Web\r\n",
        'timeout' => 5,
    )));
    $json = @file_get_contents('https://api.github.com/repos/Vanne11/KlioReader/releases', false, $ctx);
    if ($json) {
        $data = json_decode($json, true);
        if (is_array($data)) {
            $releases = $data;
            @file_put_contents($cacheFile, $json);
        }
    } else {
        $fetchError = true;
        // Intentar usar cache viejo
        if (file_exists($cacheFile)) {
            $releases = json_decode(file_get_contents($cacheFile), true);
            if (!is_array($releases)) $releases = array();
        }
    }
}

// Helper para detectar plataforma del asset
function detect_platform($name) {
    $name = strtolower($name);
    if (strpos($name, '.msi') !== false || strpos($name, 'windows') !== false || strpos($name, '.exe') !== false) return 'Windows';
    if (strpos($name, '.dmg') !== false || strpos($name, 'macos') !== false || strpos($name, 'darwin') !== false) return 'macOS';
    if (strpos($name, '.appimage') !== false || strpos($name, '.deb') !== false || strpos($name, '.rpm') !== false || strpos($name, 'linux') !== false) return 'Linux';
    return 'Otro';
}

function platform_icon($platform) {
    switch ($platform) {
        case 'Windows': return '<path fill="currentColor" d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>';
        case 'macOS': return '<path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>';
        case 'Linux': return '<path fill="currentColor" d="M12.503 18.04c-.553 0-1.002-.448-1.002-1s.449-1 1.002-1 1.001.448 1.001 1-.448 1-1.001 1zm4.638-3.677c.322-.195.427-.613.232-.935-.195-.323-.613-.427-.935-.232-1.476.896-3.393.896-4.869 0a.681.681 0 00-.936.232.682.682 0 00.233.935c.902.547 1.906.82 2.912.82 1.005 0 2.01-.273 2.912-.82h.451zM14.965 14.04c.553 0 1.001-.448 1.001-1s-.448-1-1.001-1-1.002.448-1.002 1 .449 1 1.002 1zM20 4v16H4V4h16z"/>';
        default: return '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>';
    }
}

$pageTitle = 'Descargas';
require_once __DIR__ . '/templates/base.php';
require_once __DIR__ . '/templates/header-public.php';
?>

<section class="py-16">
    <div class="max-w-4xl mx-auto px-6">
        <div class="text-center mb-12">
            <h1 class="text-3xl md:text-4xl font-bold mb-4">Descargas</h1>
            <p class="text-klio-muted">Descarga KlioReader para tu plataforma</p>
        </div>

        <?php if ($fetchError && empty($releases)): ?>
        <div class="glass rounded-xl p-8 text-center">
            <p class="text-klio-muted mb-4">No se pudieron obtener las releases en este momento.</p>
            <a href="https://github.com/Vanne11/KlioReader/releases" target="_blank" rel="noopener"
               class="inline-block px-6 py-3 rounded-lg bg-klio-primary text-klio-bg font-semibold hover:opacity-90 transition-opacity">
                Ver en GitHub
            </a>
        </div>
        <?php elseif (empty($releases)): ?>
        <div class="glass rounded-xl p-8 text-center">
            <p class="text-klio-muted mb-4">Aun no hay releases disponibles.</p>
            <a href="https://github.com/Vanne11/KlioReader" target="_blank" rel="noopener"
               class="text-klio-primary hover:underline">Visita el repositorio</a>
        </div>
        <?php else: ?>

        <?php foreach ($releases as $idx => $release): ?>
        <div class="glass rounded-xl p-6 mb-6 <?php echo $idx === 0 ? 'glow-primary' : ''; ?>">
            <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                    <div class="flex items-center gap-3">
                        <h2 class="text-xl font-bold <?php echo $idx === 0 ? 'gradient-text' : ''; ?>">
                            <?php echo e($release['tag_name'] ?? ''); ?>
                        </h2>
                        <?php if ($idx === 0): ?>
                        <span class="px-2 py-0.5 rounded-full text-xs bg-klio-primary/15 text-klio-primary">Ultima</span>
                        <?php endif; ?>
                        <?php if (!empty($release['prerelease'])): ?>
                        <span class="px-2 py-0.5 rounded-full text-xs bg-yellow-500/15 text-yellow-400">Pre-release</span>
                        <?php endif; ?>
                    </div>
                    <p class="text-klio-muted text-sm mt-1"><?php echo e($release['name'] ?? ''); ?></p>
                    <p class="text-klio-muted text-xs mt-1">
                        Publicado: <?php echo e(substr($release['published_at'] ?? '', 0, 10)); ?>
                    </p>
                </div>
            </div>

            <?php if (!empty($release['body'])): ?>
            <div class="text-sm text-klio-muted mb-4 p-4 rounded-lg bg-klio-bg/50 max-h-40 overflow-y-auto">
                <pre class="whitespace-pre-wrap font-sans"><?php echo e($release['body']); ?></pre>
            </div>
            <?php endif; ?>

            <?php if (!empty($release['assets'])): ?>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <?php foreach ($release['assets'] as $asset):
                    $platform = detect_platform($asset['name']);
                ?>
                <a href="<?php echo e($asset['browser_download_url']); ?>"
                   class="flex items-center gap-3 p-3 rounded-lg bg-klio-elevated hover:bg-klio-card border border-klio-border transition-colors group">
                    <svg class="w-6 h-6 text-klio-muted group-hover:text-klio-primary transition-colors" viewBox="0 0 24 24">
                        <?php echo platform_icon($platform); ?>
                    </svg>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium truncate"><?php echo e($asset['name']); ?></div>
                        <div class="text-xs text-klio-muted"><?php echo $platform; ?> &middot; <?php echo format_bytes($asset['size'] ?? 0); ?></div>
                    </div>
                    <svg class="w-4 h-4 text-klio-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                </a>
                <?php endforeach; ?>
            </div>
            <?php else: ?>
            <p class="text-klio-muted text-sm">Sin archivos adjuntos para esta release.</p>
            <?php endif; ?>
        </div>
        <?php endforeach; ?>

        <div class="text-center mt-8">
            <a href="https://github.com/Vanne11/KlioReader/releases" target="_blank" rel="noopener"
               class="text-klio-primary text-sm hover:underline">
                Ver todas las releases en GitHub &rarr;
            </a>
        </div>

        <?php endif; ?>
    </div>
</section>

<?php require_once __DIR__ . '/templates/footer-public.php'; ?>
