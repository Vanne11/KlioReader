<?php
require_once __DIR__ . '/../templates/functions.php';
if (session_status() === PHP_SESSION_NONE) session_start();
$_SESSION = array();
session_destroy();
header('Location: ' . base_url('admin/'));
exit;
