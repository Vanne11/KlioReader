<?php

class GCSDriver extends S3Driver
{
    /**
     * GCS en modo interoperabilidad S3.
     * Usa el endpoint S3-compatible de Google Cloud Storage.
     * Las credenciales se configuran como HMAC keys en GCS.
     */

    protected function getHost()
    {
        return 'storage.googleapis.com';
    }

    protected function getBaseUrl()
    {
        return 'https://storage.googleapis.com/' . $this->cfg('gcs_bucket');
    }

    protected function getRegion()
    {
        return 'auto';
    }

    protected function getAccessKey()
    {
        return $this->cfg('gcs_access_key');
    }

    protected function getSecretKey()
    {
        return $this->cfg('gcs_secret_key');
    }

    public function test()
    {
        if (!$this->getAccessKey() || !$this->getSecretKey()) {
            return array('ok' => false, 'message' => 'Faltan credenciales GCS HMAC (Access Key y Secret Key).');
        }
        if (!$this->cfg('gcs_bucket')) {
            return array('ok' => false, 'message' => 'Falta configurar el bucket GCS.');
        }

        $result = parent::test();
        $result['message'] = str_replace('S3', 'Google Cloud Storage', $result['message']);
        return $result;
    }
}
