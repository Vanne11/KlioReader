<?php

class B2Driver extends StorageDriver
{
    private $authToken = null;
    private $apiUrl = null;
    private $downloadUrl = null;

    private function authorize()
    {
        if ($this->authToken) return true;

        $keyId = $this->cfg('b2_key_id');
        $appKey = $this->cfg('b2_app_key');
        if (!$keyId || !$appKey) return false;

        $ch = curl_init('https://api.backblazeb2.com/b2api/v2/b2_authorize_account');
        curl_setopt_array($ch, array(
            CURLOPT_HTTPHEADER => array('Authorization: Basic ' . base64_encode($keyId . ':' . $appKey)),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ));
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code !== 200) return false;

        $data = json_decode($resp, true);
        $this->authToken = $data['authorizationToken'];
        $this->apiUrl = $data['apiUrl'];
        $this->downloadUrl = $data['downloadUrl'];
        return true;
    }

    private function getUploadUrl()
    {
        if (!$this->authorize()) return null;

        $bucketId = $this->cfg('b2_bucket_id');
        $ch = curl_init($this->apiUrl . '/b2api/v2/b2_get_upload_url');
        curl_setopt_array($ch, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(array('bucketId' => $bucketId)),
            CURLOPT_HTTPHEADER => array(
                'Authorization: ' . $this->authToken,
                'Content-Type: application/json',
            ),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ));
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code !== 200) return null;
        return json_decode($resp, true);
    }

    public function upload($localPath, $remoteName, $contentType)
    {
        $uploadData = $this->getUploadUrl();
        if (!$uploadData) return false;

        $fileContent = file_get_contents($localPath);
        $sha1 = sha1($fileContent);

        $ch = curl_init($uploadData['uploadUrl']);
        curl_setopt_array($ch, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $fileContent,
            CURLOPT_HTTPHEADER => array(
                'Authorization: ' . $uploadData['authorizationToken'],
                'X-Bz-File-Name: ' . rawurlencode($remoteName),
                'Content-Type: ' . $contentType,
                'X-Bz-Content-Sha1: ' . $sha1,
                'Content-Length: ' . strlen($fileContent),
            ),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 300,
        ));
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code !== 200) return false;

        $data = json_decode($resp, true);
        return array(
            'file_id' => $data['fileId'],
            'remote_name' => $remoteName,
        );
    }

    public function download($remoteName, $fileId = null)
    {
        if (!$this->authorize()) {
            http_response_code(500);
            echo json_encode(array('error' => 'No se pudo conectar con B2'));
            return;
        }

        $bucketName = $this->cfg('b2_bucket_name');
        $url = $this->downloadUrl . '/file/' . $bucketName . '/' . rawurlencode($remoteName);

        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_HTTPHEADER => array('Authorization: ' . $this->authToken),
            CURLOPT_WRITEFUNCTION => function ($ch, $data) {
                echo $data;
                return strlen($data);
            },
            CURLOPT_TIMEOUT => 300,
        ));
        curl_exec($ch);
        curl_close($ch);
    }

    public function delete($remoteName, $fileId = null)
    {
        if (!$fileId || !$this->authorize()) return false;

        $ch = curl_init($this->apiUrl . '/b2api/v2/b2_delete_file_version');
        curl_setopt_array($ch, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(array(
                'fileName' => $remoteName,
                'fileId' => $fileId,
            )),
            CURLOPT_HTTPHEADER => array(
                'Authorization: ' . $this->authToken,
                'Content-Type: application/json',
            ),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ));
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $code === 200;
    }

    public function test()
    {
        if (!$this->cfg('b2_key_id') || !$this->cfg('b2_app_key')) {
            return array('ok' => false, 'message' => 'Faltan credenciales B2 (Key ID y App Key).');
        }
        if (!$this->cfg('b2_bucket_id') || !$this->cfg('b2_bucket_name')) {
            return array('ok' => false, 'message' => 'Falta configurar bucket B2 (ID y nombre).');
        }
        if (!$this->authorize()) {
            return array('ok' => false, 'message' => 'Error de autenticacion con Backblaze B2. Verifica las credenciales.');
        }

        // Intentar listar para verificar acceso al bucket
        $ch = curl_init($this->apiUrl . '/b2api/v2/b2_list_file_names');
        curl_setopt_array($ch, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(array(
                'bucketId' => $this->cfg('b2_bucket_id'),
                'maxFileCount' => 1,
            )),
            CURLOPT_HTTPHEADER => array(
                'Authorization: ' . $this->authToken,
                'Content-Type: application/json',
            ),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ));
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code === 200) {
            return array('ok' => true, 'message' => 'Conexion exitosa con Backblaze B2.');
        }
        return array('ok' => false, 'message' => 'Autenticacion OK pero no se pudo acceder al bucket.');
    }
}
