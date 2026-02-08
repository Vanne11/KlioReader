<?php

class LocalDriver extends StorageDriver
{
    private function uploadsDir()
    {
        $dir = dirname(__DIR__, 2) . '/uploads';
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        return $dir;
    }

    public function upload($localPath, $remoteName, $contentType)
    {
        $parts = explode('/', $remoteName);
        $userId = $parts[0];
        $userDir = $this->uploadsDir() . '/' . $userId;
        if (!is_dir($userDir)) mkdir($userDir, 0755, true);

        $dest = $this->uploadsDir() . '/' . $remoteName;
        if ($localPath === $dest) {
            // Ya está en su lugar (move_uploaded_file ya lo movió)
            return array('file_id' => null, 'remote_name' => $remoteName);
        }

        if (copy($localPath, $dest)) {
            return array('file_id' => null, 'remote_name' => $remoteName);
        }
        return false;
    }

    public function download($remoteName, $fileId = null)
    {
        $fullPath = $this->uploadsDir() . '/' . $remoteName;
        if (!file_exists($fullPath)) {
            http_response_code(404);
            echo json_encode(array('error' => 'Archivo no encontrado'));
            return;
        }
        readfile($fullPath);
    }

    public function delete($remoteName, $fileId = null)
    {
        $fullPath = $this->uploadsDir() . '/' . $remoteName;
        if (file_exists($fullPath)) {
            return unlink($fullPath);
        }
        return true;
    }

    public function test()
    {
        $dir = $this->uploadsDir();
        if (is_writable($dir)) {
            return array('ok' => true, 'message' => 'Directorio uploads/ escribible.');
        }
        return array('ok' => false, 'message' => 'Directorio uploads/ no es escribible.');
    }
}
