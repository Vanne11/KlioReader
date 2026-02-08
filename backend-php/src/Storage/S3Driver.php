<?php

class S3Driver extends StorageDriver
{
    protected function getHost()
    {
        $endpoint = $this->cfg('s3_endpoint');
        if ($endpoint) {
            return preg_replace('#^https?://#', '', rtrim($endpoint, '/'));
        }
        $region = $this->cfg('s3_region', 'us-east-1');
        $bucket = $this->cfg('s3_bucket');
        return $bucket . '.s3.' . $region . '.amazonaws.com';
    }

    protected function getBaseUrl()
    {
        $endpoint = $this->cfg('s3_endpoint');
        if ($endpoint) {
            return rtrim($endpoint, '/') . '/' . $this->cfg('s3_bucket');
        }
        $region = $this->cfg('s3_region', 'us-east-1');
        $bucket = $this->cfg('s3_bucket');
        return 'https://' . $bucket . '.s3.' . $region . '.amazonaws.com';
    }

    protected function getRegion()
    {
        return $this->cfg('s3_region', 'us-east-1');
    }

    protected function getAccessKey()
    {
        return $this->cfg('s3_access_key');
    }

    protected function getSecretKey()
    {
        return $this->cfg('s3_secret_key');
    }

    private function sign($method, $uri, $headers, $payload, $service = 's3')
    {
        $accessKey = $this->getAccessKey();
        $secretKey = $this->getSecretKey();
        $region = $this->getRegion();
        $date = gmdate('Ymd\THis\Z');
        $dateShort = gmdate('Ymd');

        $payloadHash = hash('sha256', $payload);
        $headers['x-amz-content-sha256'] = $payloadHash;
        $headers['x-amz-date'] = $date;

        // Canonical headers
        ksort($headers);
        $canonicalHeaders = '';
        $signedHeadersList = array();
        foreach ($headers as $k => $v) {
            $canonicalHeaders .= strtolower($k) . ':' . trim($v) . "\n";
            $signedHeadersList[] = strtolower($k);
        }
        $signedHeaders = implode(';', $signedHeadersList);

        $canonicalRequest = $method . "\n" . $uri . "\n" . '' . "\n" . $canonicalHeaders . "\n" . $signedHeaders . "\n" . $payloadHash;

        $scope = $dateShort . '/' . $region . '/' . $service . '/aws4_request';
        $stringToSign = "AWS4-HMAC-SHA256\n" . $date . "\n" . $scope . "\n" . hash('sha256', $canonicalRequest);

        $signingKey = hash_hmac('sha256', 'aws4_request',
            hash_hmac('sha256', $service,
                hash_hmac('sha256', $region,
                    hash_hmac('sha256', $dateShort, 'AWS4' . $secretKey, true),
                true),
            true),
        true);

        $signature = hash_hmac('sha256', $stringToSign, $signingKey);

        $authHeader = 'AWS4-HMAC-SHA256 Credential=' . $accessKey . '/' . $scope
            . ',SignedHeaders=' . $signedHeaders
            . ',Signature=' . $signature;

        return array(
            'Authorization' => $authHeader,
            'x-amz-content-sha256' => $payloadHash,
            'x-amz-date' => $date,
        );
    }

    public function upload($localPath, $remoteName, $contentType)
    {
        $fileContent = file_get_contents($localPath);
        $host = $this->getHost();
        $uri = '/' . rawurlencode($remoteName);

        $headers = array(
            'Host' => $host,
            'Content-Type' => $contentType,
        );

        $authHeaders = $this->sign('PUT', $uri, $headers, $fileContent);
        $allHeaders = array_merge($headers, $authHeaders);

        $curlHeaders = array();
        foreach ($allHeaders as $k => $v) {
            $curlHeaders[] = $k . ': ' . $v;
        }

        $url = $this->getBaseUrl() . '/' . rawurlencode($remoteName);
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_CUSTOMREQUEST => 'PUT',
            CURLOPT_POSTFIELDS => $fileContent,
            CURLOPT_HTTPHEADER => $curlHeaders,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 300,
        ));
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code >= 200 && $code < 300) {
            return array('file_id' => $remoteName, 'remote_name' => $remoteName);
        }
        return false;
    }

    public function download($remoteName, $fileId = null)
    {
        $host = $this->getHost();
        $uri = '/' . rawurlencode($remoteName);

        $headers = array('Host' => $host);
        $authHeaders = $this->sign('GET', $uri, $headers, '');
        $allHeaders = array_merge($headers, $authHeaders);

        $curlHeaders = array();
        foreach ($allHeaders as $k => $v) {
            $curlHeaders[] = $k . ': ' . $v;
        }

        $url = $this->getBaseUrl() . '/' . rawurlencode($remoteName);
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_HTTPHEADER => $curlHeaders,
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
        $host = $this->getHost();
        $uri = '/' . rawurlencode($remoteName);

        $headers = array('Host' => $host);
        $authHeaders = $this->sign('DELETE', $uri, $headers, '');
        $allHeaders = array_merge($headers, $authHeaders);

        $curlHeaders = array();
        foreach ($allHeaders as $k => $v) {
            $curlHeaders[] = $k . ': ' . $v;
        }

        $url = $this->getBaseUrl() . '/' . rawurlencode($remoteName);
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_CUSTOMREQUEST => 'DELETE',
            CURLOPT_HTTPHEADER => $curlHeaders,
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
        if (!$this->getAccessKey() || !$this->getSecretKey()) {
            return array('ok' => false, 'message' => 'Faltan credenciales S3 (Access Key y Secret Key).');
        }
        if (!$this->cfg('s3_bucket')) {
            return array('ok' => false, 'message' => 'Falta configurar el bucket S3.');
        }

        $host = $this->getHost();
        $uri = '/';
        $headers = array('Host' => $host);
        $authHeaders = $this->sign('HEAD', $uri, $headers, '');
        $allHeaders = array_merge($headers, $authHeaders);

        $curlHeaders = array();
        foreach ($allHeaders as $k => $v) {
            $curlHeaders[] = $k . ': ' . $v;
        }

        $url = $this->getBaseUrl() . '/';
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_CUSTOMREQUEST => 'HEAD',
            CURLOPT_HTTPHEADER => $curlHeaders,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_NOBODY => true,
            CURLOPT_TIMEOUT => 15,
        ));
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return array('ok' => false, 'message' => 'Error de conexion: ' . $error);
        }
        if ($code >= 200 && $code < 400) {
            return array('ok' => true, 'message' => 'Conexion exitosa con S3.');
        }
        return array('ok' => false, 'message' => 'S3 respondio con codigo HTTP ' . $code . '.');
    }
}
