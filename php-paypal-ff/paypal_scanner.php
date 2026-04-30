<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';

function scanner_request_is_allowed(): bool
{
    if (PHP_SAPI === 'cli') {
        return true;
    }

    $expectedToken = trim(get_setting('scan_token'));
    $givenToken = trim((string)($_GET['token'] ?? ''));
    if ($expectedToken === '' || !hash_equals($expectedToken, $givenToken)) {
        return false;
    }

    $allowedIps = app_config('scanner_allowed_ips', []);
    if (!is_array($allowedIps) || $allowedIps === []) {
        return true;
    }

    $remoteIp = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    return in_array($remoteIp, $allowedIps, true);
}

if (!scanner_request_is_allowed()) {
    http_response_code(403);
    echo "Forbidden\n";
    exit;
}

try {
    $summary = run_paypal_scanner();
    if (PHP_SAPI === 'cli') {
        echo json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
    } else {
        json_response(['ok' => true, 'summary' => $summary]);
    }
} catch (Throwable $error) {
    app_log('Scanner failed', ['error' => $error->getMessage()]);
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, 'Scanner failed: ' . $error->getMessage() . PHP_EOL);
        exit(1);
    }
    json_response(['ok' => false, 'error' => $error->getMessage()], 500);
}
