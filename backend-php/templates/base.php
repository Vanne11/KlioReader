<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo isset($pageTitle) ? e($pageTitle) . ' - ' : ''; ?><?php echo e(get_setting('site_name', 'KlioReader')); ?></title>
    <link rel="icon" type="image/x-icon" href="<?php echo base_url('assets/img/favicon.ico'); ?>">
    <link rel="icon" type="image/png" sizes="32x32" href="<?php echo base_url('assets/img/favicon.png'); ?>">
    <link rel="apple-touch-icon" href="<?php echo base_url('assets/img/logo.png'); ?>">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
    tailwind.config = {
        theme: {
            extend: {
                colors: {
                    klio: {
                        bg: '#0f0f14',
                        card: '#16161e',
                        elevated: '#1c1c26',
                        primary: 'hsl(265, 89%, 78%)',
                        accent: 'hsl(326, 100%, 74%)',
                        text: '#cdd6f4',
                        muted: '#6c7086',
                        border: 'rgba(255,255,255,0.08)',
                    }
                },
                fontFamily: {
                    sans: ['Inter', 'system-ui', 'sans-serif'],
                    serif: ['Libre Baskerville', 'Georgia', 'serif'],
                }
            }
        }
    }
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?php echo base_url('assets/css/style.css'); ?>">
    <script>var KLIO_BASE = '<?php echo base_url(); ?>';</script>
</head>
<body class="bg-klio-bg text-klio-text font-sans min-h-screen antialiased">
