<?php

declare(strict_types=1);

return [
    'db' => [
        'dsn' => 'mysql:host=127.0.0.1;dbname=nosmarket;charset=utf8mb4',
        'user' => 'nosmarket_user',
        'password' => 'change_me',
    ],

    // Generate with: php -r "echo password_hash('your-admin-password', PASSWORD_DEFAULT), PHP_EOL;"
    'admin_password_hash' => '$2y$10$replace_this_hash_before_use',

    // Used in customer email links.
    'base_url' => 'https://www.nosmarket.com',

    // Optional defense when running paypal_scanner.php through a URL.
    // Empty array means token-only protection.
    'scanner_allowed_ips' => [
        '127.0.0.1',
        '::1',
    ],

    'log_file' => __DIR__ . '/storage/logs/paypal_scanner_errors.log',
];
