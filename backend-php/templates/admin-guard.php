<?php
require_once __DIR__ . '/functions.php';

if (session_status() === PHP_SESSION_NONE) session_start();

if (empty($_SESSION['admin_id'])) {
    redirect(base_url('admin/'));
}
