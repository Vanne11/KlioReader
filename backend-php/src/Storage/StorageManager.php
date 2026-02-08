<?php

class StorageManager
{
    private static $instance = null;
    private $settings = array();

    private function __construct()
    {
        $this->loadSettings();
    }

    public static function getInstance()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function loadSettings()
    {
        try {
            $db = Database::get();
            $rows = $db->query('SELECT key, value FROM site_settings')->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as $row) {
                $this->settings[$row['key']] = $row['value'];
            }
        } catch (Exception $e) {
            // Silently fail
        }
    }

    private function setting($key, $default = '')
    {
        return isset($this->settings[$key]) ? $this->settings[$key] : $default;
    }

    /**
     * Retorna el driver activo según la configuración.
     */
    public function getDriver($providerOverride = null)
    {
        $provider = $providerOverride ? $providerOverride : $this->setting('storage_provider', 'local');

        switch ($provider) {
            case 'b2':
                return new B2Driver(array(
                    'b2_key_id' => $this->setting('b2_key_id'),
                    'b2_app_key' => $this->setting('b2_app_key'),
                    'b2_bucket_name' => $this->setting('b2_bucket_name'),
                    'b2_bucket_id' => $this->setting('b2_bucket_id'),
                ));

            case 's3':
                return new S3Driver(array(
                    's3_access_key' => $this->setting('s3_access_key'),
                    's3_secret_key' => $this->setting('s3_secret_key'),
                    's3_bucket' => $this->setting('s3_bucket'),
                    's3_region' => $this->setting('s3_region', 'us-east-1'),
                    's3_endpoint' => $this->setting('s3_endpoint'),
                ));

            case 'gcs':
                return new GCSDriver(array(
                    'gcs_access_key' => $this->setting('gcs_access_key'),
                    'gcs_secret_key' => $this->setting('gcs_secret_key'),
                    'gcs_bucket' => $this->setting('gcs_bucket'),
                ));

            case 'gdrive':
                return new GoogleDriveDriver(array(
                    'gdrive_key_file' => $this->setting('gdrive_key_file'),
                    'gdrive_folder_id' => $this->setting('gdrive_folder_id'),
                ));

            case 'local':
            default:
                return new LocalDriver();
        }
    }

    /**
     * Crea un driver temporal con credenciales proporcionadas (para test).
     */
    public function getDriverWithConfig($provider, $config)
    {
        switch ($provider) {
            case 'b2':
                return new B2Driver($config);
            case 's3':
                return new S3Driver($config);
            case 'gcs':
                return new GCSDriver($config);
            case 'gdrive':
                return new GoogleDriveDriver($config);
            case 'local':
            default:
                return new LocalDriver($config);
        }
    }

    /**
     * Retorna el nombre del proveedor activo.
     */
    public function getActiveProvider()
    {
        return $this->setting('storage_provider', 'local');
    }

    /**
     * Computa un hash normalizado de titulo+autor para detección de libros.
     */
    public static function computeBookHash($title, $author)
    {
        $normalized = mb_strtolower(trim($title), 'UTF-8') . '::' . mb_strtolower(trim($author), 'UTF-8');
        // Remover caracteres especiales y espacios múltiples
        $normalized = preg_replace('/\s+/', ' ', $normalized);
        $normalized = preg_replace('/[^\p{L}\p{N}\s:]/u', '', $normalized);
        return hash('sha256', $normalized);
    }
}
