<?php
require_once __DIR__ . '/../templates/admin-guard.php';
require_once __DIR__ . '/../templates/csrf.php';

$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $settings = array(
        'site_name' => trim($_POST['site_name'] ?? 'KlioReader'),
        'site_description' => trim($_POST['site_description'] ?? ''),
        'hero_title' => trim($_POST['hero_title'] ?? ''),
        'hero_subtitle' => trim($_POST['hero_subtitle'] ?? ''),
        'registration_enabled' => isset($_POST['registration_enabled']) ? '1' : '0',
        'registration_closed_message' => trim($_POST['registration_closed_message'] ?? ''),
        'default_upload_limit' => (string)((int)($_POST['default_upload_limit_mb'] ?? 500) * 1048576),
        // Storage
        'storage_provider' => $_POST['storage_provider'] ?? 'local',
        // B2
        'b2_key_id' => trim($_POST['b2_key_id'] ?? ''),
        'b2_app_key' => trim($_POST['b2_app_key'] ?? ''),
        'b2_bucket_name' => trim($_POST['b2_bucket_name'] ?? ''),
        'b2_bucket_id' => trim($_POST['b2_bucket_id'] ?? ''),
        // S3
        's3_access_key' => trim($_POST['s3_access_key'] ?? ''),
        's3_secret_key' => trim($_POST['s3_secret_key'] ?? ''),
        's3_bucket' => trim($_POST['s3_bucket'] ?? ''),
        's3_region' => trim($_POST['s3_region'] ?? 'us-east-1'),
        's3_endpoint' => trim($_POST['s3_endpoint'] ?? ''),
        // GCS
        'gcs_access_key' => trim($_POST['gcs_access_key'] ?? ''),
        'gcs_secret_key' => trim($_POST['gcs_secret_key'] ?? ''),
        'gcs_bucket' => trim($_POST['gcs_bucket'] ?? ''),
        // Google Drive
        'gdrive_key_file' => trim($_POST['gdrive_key_file'] ?? ''),
        'gdrive_folder_id' => trim($_POST['gdrive_folder_id'] ?? ''),
    );

    $stmt = $pdo->prepare('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)');
    foreach ($settings as $key => $value) {
        $stmt->execute(array($key, $value));
    }

    flash('success', 'Configuracion guardada.');
    redirect(base_url('admin/settings.php'));
}

// Cargar settings actuales
$allSettings = array();
$rows = $pdo->query('SELECT key, value FROM site_settings')->fetchAll();
foreach ($rows as $row) {
    $allSettings[$row['key']] = $row['value'];
}

$s = function($key, $default = '') use ($allSettings) {
    return isset($allSettings[$key]) ? $allSettings[$key] : $default;
};

$pageTitle = 'Configuracion';
require_once __DIR__ . '/../templates/admin-layout.php';
?>

<h1 class="text-xl md:text-2xl font-bold mb-6">Configuracion</h1>

<div class="bg-klio-card border border-klio-border rounded-xl p-4 md:p-6 max-w-2xl">
    <form method="POST" class="space-y-5">
        <?php echo csrf_field(); ?>

        <div>
            <label class="form-label">Nombre del Sitio</label>
            <input type="text" name="site_name" value="<?php echo e($s('site_name', 'KlioReader')); ?>" class="form-input">
        </div>

        <div>
            <label class="form-label">Descripcion del Sitio</label>
            <textarea name="site_description" rows="2" class="form-input"><?php echo e($s('site_description')); ?></textarea>
        </div>

        <hr class="border-klio-border">

        <div>
            <label class="form-label">Titulo del Hero (Landing)</label>
            <input type="text" name="hero_title" value="<?php echo e($s('hero_title', 'Lee sin limites')); ?>" class="form-input">
        </div>

        <div>
            <label class="form-label">Subtitulo del Hero</label>
            <input type="text" name="hero_subtitle" value="<?php echo e($s('hero_subtitle')); ?>" class="form-input">
        </div>

        <hr class="border-klio-border">

        <!-- Registro de usuarios -->
        <h2 class="text-lg font-semibold text-klio-text">Registro de Usuarios</h2>

        <div class="flex items-center gap-3">
            <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" name="registration_enabled" value="1" class="sr-only peer"
                    <?php echo $s('registration_enabled', '1') === '1' ? 'checked' : ''; ?>
                    onchange="toggleRegMsg()">
                <div class="w-11 h-6 bg-klio-elevated border border-klio-border rounded-full peer peer-checked:bg-klio-primary peer-checked:border-klio-primary transition-colors after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:after:translate-x-5"></div>
            </label>
            <span class="text-sm text-klio-text">Permitir nuevos registros</span>
        </div>

        <div id="registration-closed-msg" style="display:none;">
            <label class="form-label">Mensaje para usuarios (cuando el registro esta cerrado)</label>
            <textarea name="registration_closed_message" rows="2" class="form-input" placeholder="Por ahora no estamos aceptando registros. Muchas gracias por tu interes."><?php echo e($s('registration_closed_message', 'Por ahora no estamos aceptando registros. Muchas gracias por tu interes.')); ?></textarea>
            <p class="text-klio-muted text-xs mt-1">Este mensaje se mostrara a los usuarios que intenten crear una cuenta.</p>
        </div>

        <hr class="border-klio-border">

        <div>
            <label class="form-label">Limite de subida por defecto (MB)</label>
            <input type="number" name="default_upload_limit_mb" min="0" step="1"
                value="<?php echo round((int)$s('default_upload_limit', '524288000') / 1048576); ?>" class="form-input max-w-xs">
            <p class="text-klio-muted text-xs mt-1">Limite para nuevos usuarios. Los existentes no se modifican.</p>
        </div>

        <hr class="border-klio-border">

        <!-- Almacenamiento en la Nube -->
        <h2 class="text-lg font-semibold text-klio-text">Almacenamiento</h2>
        <p class="text-klio-muted text-xs -mt-3">Configura donde se guardan los libros subidos por los usuarios.</p>

        <div>
            <label class="form-label">Proveedor de Almacenamiento</label>
            <select name="storage_provider" id="storage_provider" class="form-input" onchange="toggleStorageFields()">
                <option value="local" <?php echo $s('storage_provider', 'local') === 'local' ? 'selected' : ''; ?>>Local (servidor)</option>
                <option value="b2" <?php echo $s('storage_provider') === 'b2' ? 'selected' : ''; ?>>Backblaze B2</option>
                <option value="s3" <?php echo $s('storage_provider') === 's3' ? 'selected' : ''; ?>>Amazon S3</option>
                <option value="gcs" <?php echo $s('storage_provider') === 'gcs' ? 'selected' : ''; ?>>Google Cloud Storage</option>
                <option value="gdrive" <?php echo $s('storage_provider') === 'gdrive' ? 'selected' : ''; ?>>Google Drive</option>
            </select>
        </div>

        <!-- Backblaze B2 -->
        <div id="fields-b2" class="storage-fields space-y-3" style="display:none;">
            <div class="p-4 rounded-lg bg-klio-elevated border border-klio-border space-y-3">
                <h3 class="text-sm font-medium text-klio-text">Backblaze B2</h3>
                <div>
                    <label class="form-label">Key ID</label>
                    <input type="password" name="b2_key_id" value="<?php echo e($s('b2_key_id')); ?>" class="form-input" autocomplete="off">
                </div>
                <div>
                    <label class="form-label">Application Key</label>
                    <input type="password" name="b2_app_key" value="<?php echo e($s('b2_app_key')); ?>" class="form-input" autocomplete="off">
                </div>
                <div>
                    <label class="form-label">Bucket Name</label>
                    <input type="text" name="b2_bucket_name" value="<?php echo e($s('b2_bucket_name')); ?>" class="form-input">
                </div>
                <div>
                    <label class="form-label">Bucket ID</label>
                    <input type="text" name="b2_bucket_id" value="<?php echo e($s('b2_bucket_id')); ?>" class="form-input">
                </div>
                <button type="button" onclick="testStorage('b2')" class="btn-test text-sm px-3 py-1.5 rounded-lg bg-klio-elevated border border-klio-border text-klio-text hover:border-klio-primary transition-colors">Probar Conexion</button>
                <span id="test-result-b2" class="text-sm ml-2"></span>
            </div>
        </div>

        <!-- Amazon S3 -->
        <div id="fields-s3" class="storage-fields space-y-3" style="display:none;">
            <div class="p-4 rounded-lg bg-klio-elevated border border-klio-border space-y-3">
                <h3 class="text-sm font-medium text-klio-text">Amazon S3</h3>
                <div>
                    <label class="form-label">Access Key</label>
                    <input type="password" name="s3_access_key" value="<?php echo e($s('s3_access_key')); ?>" class="form-input" autocomplete="off">
                </div>
                <div>
                    <label class="form-label">Secret Key</label>
                    <input type="password" name="s3_secret_key" value="<?php echo e($s('s3_secret_key')); ?>" class="form-input" autocomplete="off">
                </div>
                <div>
                    <label class="form-label">Bucket</label>
                    <input type="text" name="s3_bucket" value="<?php echo e($s('s3_bucket')); ?>" class="form-input">
                </div>
                <div>
                    <label class="form-label">Region</label>
                    <input type="text" name="s3_region" value="<?php echo e($s('s3_region', 'us-east-1')); ?>" class="form-input" placeholder="us-east-1">
                </div>
                <div>
                    <label class="form-label">Endpoint personalizado (opcional)</label>
                    <input type="text" name="s3_endpoint" value="<?php echo e($s('s3_endpoint')); ?>" class="form-input" placeholder="https://s3-compatible.example.com">
                    <p class="text-klio-muted text-xs mt-1">Dejar vacio para AWS S3. Usar para proveedores S3-compatibles (MinIO, DigitalOcean Spaces, etc.)</p>
                </div>
                <button type="button" onclick="testStorage('s3')" class="btn-test text-sm px-3 py-1.5 rounded-lg bg-klio-elevated border border-klio-border text-klio-text hover:border-klio-primary transition-colors">Probar Conexion</button>
                <span id="test-result-s3" class="text-sm ml-2"></span>
            </div>
        </div>

        <!-- Google Cloud Storage -->
        <div id="fields-gcs" class="storage-fields space-y-3" style="display:none;">
            <div class="p-4 rounded-lg bg-klio-elevated border border-klio-border space-y-3">
                <h3 class="text-sm font-medium text-klio-text">Google Cloud Storage (S3 Interop)</h3>
                <p class="text-klio-muted text-xs">Usa las HMAC keys de GCS. Crear en: Cloud Console > Storage > Settings > Interoperability.</p>
                <div>
                    <label class="form-label">Access Key (HMAC)</label>
                    <input type="password" name="gcs_access_key" value="<?php echo e($s('gcs_access_key')); ?>" class="form-input" autocomplete="off">
                </div>
                <div>
                    <label class="form-label">Secret Key (HMAC)</label>
                    <input type="password" name="gcs_secret_key" value="<?php echo e($s('gcs_secret_key')); ?>" class="form-input" autocomplete="off">
                </div>
                <div>
                    <label class="form-label">Bucket</label>
                    <input type="text" name="gcs_bucket" value="<?php echo e($s('gcs_bucket')); ?>" class="form-input">
                </div>
                <button type="button" onclick="testStorage('gcs')" class="btn-test text-sm px-3 py-1.5 rounded-lg bg-klio-elevated border border-klio-border text-klio-text hover:border-klio-primary transition-colors">Probar Conexion</button>
                <span id="test-result-gcs" class="text-sm ml-2"></span>
            </div>
        </div>

        <!-- Google Drive -->
        <div id="fields-gdrive" class="storage-fields space-y-3" style="display:none;">
            <div class="p-4 rounded-lg bg-klio-elevated border border-klio-border space-y-3">
                <h3 class="text-sm font-medium text-klio-text">Google Drive</h3>
                <p class="text-klio-muted text-xs">Requiere una Service Account con acceso a Google Drive API.</p>
                <div>
                    <label class="form-label">Service Account JSON</label>
                    <textarea name="gdrive_key_file" rows="4" class="form-input font-mono text-xs" placeholder='{"type":"service_account",...}'><?php echo e($s('gdrive_key_file')); ?></textarea>
                    <p class="text-klio-muted text-xs mt-1">Pega el contenido completo del archivo JSON de la service account.</p>
                </div>
                <div>
                    <label class="form-label">Folder ID (opcional)</label>
                    <input type="text" name="gdrive_folder_id" value="<?php echo e($s('gdrive_folder_id')); ?>" class="form-input" placeholder="ID de carpeta en Google Drive">
                    <p class="text-klio-muted text-xs mt-1">Comparte esta carpeta con la service account. Dejar vacio para usar la raiz.</p>
                </div>
                <button type="button" onclick="testStorage('gdrive')" class="btn-test text-sm px-3 py-1.5 rounded-lg bg-klio-elevated border border-klio-border text-klio-text hover:border-klio-primary transition-colors">Probar Conexion</button>
                <span id="test-result-gdrive" class="text-sm ml-2"></span>
            </div>
        </div>

        <div class="flex justify-end pt-2">
            <button type="submit" class="btn-primary">Guardar</button>
        </div>
    </form>
</div>

<script>
function toggleStorageFields() {
    var provider = document.getElementById('storage_provider').value;
    var allFields = document.querySelectorAll('.storage-fields');
    for (var i = 0; i < allFields.length; i++) {
        allFields[i].style.display = 'none';
    }
    var target = document.getElementById('fields-' + provider);
    if (target) target.style.display = 'block';
}

function testStorage(provider) {
    var resultEl = document.getElementById('test-result-' + provider);
    resultEl.textContent = 'Probando...';
    resultEl.className = 'text-sm ml-2 text-klio-muted';

    var form = document.querySelector('form');
    var formData = new FormData(form);
    formData.set('provider', provider);

    fetch(KLIO_BASE + 'admin/test-storage.php', {
        method: 'POST',
        body: formData
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        resultEl.textContent = data.message;
        resultEl.className = 'text-sm ml-2 ' + (data.ok ? 'text-green-400' : 'text-red-400');
    })
    .catch(function(e) {
        resultEl.textContent = 'Error de conexion';
        resultEl.className = 'text-sm ml-2 text-red-400';
    });
}

function toggleRegMsg() {
    var cb = document.querySelector('input[name="registration_enabled"]');
    document.getElementById('registration-closed-msg').style.display = cb.checked ? 'none' : 'block';
}

// Mostrar campos del proveedor actual al cargar
toggleStorageFields();
toggleRegMsg();
</script>

    </main>
</div>
</body>
</html>
