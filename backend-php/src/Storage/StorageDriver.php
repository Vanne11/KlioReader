<?php

abstract class StorageDriver
{
    protected $config = array();

    public function __construct($config = array())
    {
        $this->config = $config;
    }

    /**
     * Sube un archivo al proveedor.
     * @return array|false  Array con 'file_id' y 'remote_name' en éxito, false en fallo.
     */
    abstract public function upload($localPath, $remoteName, $contentType);

    /**
     * Descarga un archivo y lo escribe a php://output.
     */
    abstract public function download($remoteName, $fileId = null);

    /**
     * Elimina un archivo del proveedor.
     */
    abstract public function delete($remoteName, $fileId = null);

    /**
     * Prueba la conexión con el proveedor.
     * @return array  ['ok' => bool, 'message' => string]
     */
    abstract public function test();

    protected function cfg($key, $default = '')
    {
        return isset($this->config[$key]) ? $this->config[$key] : $default;
    }
}
