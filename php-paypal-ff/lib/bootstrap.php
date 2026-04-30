<?php

declare(strict_types=1);

mb_internal_encoding('UTF-8');
date_default_timezone_set('Asia/Bangkok');

$configPath = __DIR__ . '/../config.php';
if (!is_file($configPath)) {
    $configPath = __DIR__ . '/../config.example.php';
}

$config = require $configPath;

$logFile = (string)($config['log_file'] ?? (__DIR__ . '/../storage/logs/paypal_scanner_errors.log'));
$logDir = dirname($logFile);
if (!is_dir($logDir)) {
    mkdir($logDir, 0775, true);
}

ini_set('default_charset', 'UTF-8');
ini_set('log_errors', '1');
ini_set('error_log', $logFile);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/settings.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/orders.php';
require_once __DIR__ . '/gmail_scanner.php';

function app_config(?string $key = null, mixed $default = null): mixed
{
    global $config;
    if ($key === null) {
        return $config;
    }
    return $config[$key] ?? $default;
}

function app_base_url(): string
{
    return rtrim((string)app_config('base_url', ''), '/');
}

function h(mixed $value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function normalize_text(mixed $value): string
{
    return trim((string)$value);
}

function normalize_email(mixed $value): string
{
    return mb_strtolower(trim((string)$value), 'UTF-8');
}

function app_log(string $message, array $context = []): void
{
    $line = '[' . date('c') . '] ' . $message;
    if ($context !== []) {
        $line .= ' ' . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    error_log($line);
}
