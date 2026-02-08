<?php

class GoogleDriveDriver extends StorageDriver
{
    private $accessToken = null;

    private function getAccessToken()
    {
        if ($this->accessToken) return $this->accessToken;

        $keyFileJson = $this->cfg('gdrive_key_file');
        if (!$keyFileJson) return null;

        $key = json_decode($keyFileJson, true);
        if (!$key || !isset($key['client_email']) || !isset($key['private_key'])) return null;

        // Crear JWT
        $header = base64_encode(json_encode(array('alg' => 'RS256', 'typ' => 'JWT')));
        $now = time();
        $claims = base64_encode(json_encode(array(
            'iss' => $key['client_email'],
            'scope' => 'https://www.googleapis.com/auth/drive.file',
            'aud' => 'https://oauth2.googleapis.com/token',
            'iat' => $now,
            'exp' => $now + 3600,
        )));

        $header = rtrim(strtr($header, '+/', '-_'), '=');
        $claims = rtrim(strtr($claims, '+/', '-_'), '=');

        $toSign = $header . '.' . $claims;
        $signature = '';
        $pkeyId = openssl_pkey_get_private($key['private_key']);
        if (!$pkeyId) return null;
        openssl_sign($toSign, $signature, $pkeyId, OPENSSL_ALGO_SHA256);
        $sig = rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');

        $jwt = $toSign . '.' . $sig;

        // Intercambiar JWT por access token
        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query(array(
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $jwt,
            )),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ));
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code !== 200) return null;

        $data = json_decode($resp, true);
        $this->accessToken = isset($data['access_token']) ? $data['access_token'] : null;
        return $this->accessToken;
    }

    public function upload($localPath, $remoteName, $contentType)
    {
        $token = $this->getAccessToken();
        if (!$token) return false;

        $folderId = $this->cfg('gdrive_folder_id');

        // Metadata
        $metadata = array('name' => $remoteName);
        if ($folderId) {
            $metadata['parents'] = array($folderId);
        }

        $boundary = 'klioreader_' . uniqid();
        $fileContent = file_get_contents($localPath);

        $body = '--' . $boundary . "\r\n"
            . "Content-Type: application/json; charset=UTF-8\r\n\r\n"
            . json_encode($metadata) . "\r\n"
            . '--' . $boundary . "\r\n"
            . 'Content-Type: ' . $contentType . "\r\n\r\n"
            . $fileContent . "\r\n"
            . '--' . $boundary . "--\r\n";

        $ch = curl_init('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
        curl_setopt_array($ch, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => array(
                'Authorization: Bearer ' . $token,
                'Content-Type: multipart/related; boundary=' . $boundary,
                'Content-Length: ' . strlen($body),
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
            'file_id' => $data['id'],
            'remote_name' => $remoteName,
        );
    }

    public function download($remoteName, $fileId = null)
    {
        $token = $this->getAccessToken();
        if (!$token || !$fileId) {
            http_response_code(500);
            echo json_encode(array('error' => 'No se pudo conectar con Google Drive'));
            return;
        }

        $url = 'https://www.googleapis.com/drive/v3/files/' . urlencode($fileId) . '?alt=media';
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_HTTPHEADER => array('Authorization: Bearer ' . $token),
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
        $token = $this->getAccessToken();
        if (!$token || !$fileId) return false;

        $url = 'https://www.googleapis.com/drive/v3/files/' . urlencode($fileId);
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_CUSTOMREQUEST => 'DELETE',
            CURLOPT_HTTPHEADER => array('Authorization: Bearer ' . $token),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ));
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $code >= 200 && $code < 300;
    }

    public function test()
    {
        $keyFileJson = $this->cfg('gdrive_key_file');
        if (!$keyFileJson) {
            return array('ok' => false, 'message' => 'Falta el JSON de la service account de Google Drive.');
        }

        $key = json_decode($keyFileJson, true);
        if (!$key) {
            return array('ok' => false, 'message' => 'El JSON de la service account no es valido.');
        }

        $token = $this->getAccessToken();
        if (!$token) {
            return array('ok' => false, 'message' => 'No se pudo obtener access token. Verifica la service account.');
        }

        // Verificar acceso a la carpeta
        $folderId = $this->cfg('gdrive_folder_id');
        if ($folderId) {
            $url = 'https://www.googleapis.com/drive/v3/files/' . urlencode($folderId) . '?fields=id,name';
            $ch = curl_init($url);
            curl_setopt_array($ch, array(
                CURLOPT_HTTPHEADER => array('Authorization: Bearer ' . $token),
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 15,
            ));
            $resp = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($code !== 200) {
                return array('ok' => false, 'message' => 'Token OK pero no se pudo acceder a la carpeta configurada.');
            }
        }

        return array('ok' => true, 'message' => 'Conexion exitosa con Google Drive.');
    }
}
