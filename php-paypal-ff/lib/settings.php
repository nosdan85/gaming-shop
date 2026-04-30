<?php

declare(strict_types=1);

function get_setting(string $key, string $default = ''): string
{
    $stmt = db()->prepare('SELECT setting_value FROM settings WHERE setting_key = :key LIMIT 1');
    $stmt->execute(['key' => $key]);
    $value = $stmt->fetchColumn();
    if ($value === false || $value === null) {
        return $default;
    }
    return (string)$value;
}

function get_settings(array $keys): array
{
    if ($keys === []) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $stmt = db()->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ($placeholders)");
    $stmt->execute(array_values($keys));
    $settings = [];
    foreach ($stmt->fetchAll() as $row) {
        $settings[(string)$row['setting_key']] = (string)($row['setting_value'] ?? '');
    }
    foreach ($keys as $key) {
        $settings[$key] ??= '';
    }
    return $settings;
}

function set_setting(string $key, string $value): void
{
    $stmt = db()->prepare(
        'INSERT INTO settings (setting_key, setting_value) VALUES (:key, :value)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
    );
    $stmt->execute(['key' => $key, 'value' => $value]);
}

function set_settings(array $settings): void
{
    foreach ($settings as $key => $value) {
        set_setting((string)$key, (string)$value);
    }
}

function paypal_receiver_email(): string
{
    return normalize_email(get_setting('paypal_email'));
}

function app_currency(): string
{
    $currency = strtoupper(get_setting('currency', 'USD'));
    return preg_match('/^[A-Z]{3}$/', $currency) ? $currency : 'USD';
}
