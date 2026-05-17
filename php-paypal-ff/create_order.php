<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$contentType = (string)($_SERVER['CONTENT_TYPE'] ?? '');
$payload = [];
if (str_contains($contentType, 'application/json')) {
    $payload = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        json_response(['ok' => false, 'error' => 'Invalid JSON payload'], 400);
    }
} else {
    $payload = $_POST;
}

try {
    $customerEmail = (string)($payload['customer_email'] ?? $payload['customerEmail'] ?? '');
    $products = normalize_products($payload['products'] ?? []);
    $order = create_order($customerEmail, $products);
    json_response([
        'ok' => true,
        'order_id' => $order['id'],
        'payment_url' => app_base_url() . '/payment.php?id=' . rawurlencode((string)$order['id']),
        'paypal_email' => paypal_receiver_email(),
        'total' => (float)$order['total'],
        'currency' => app_currency(),
        'memo_expected' => $order['memo_expected'],
        'payment_status' => $order['payment_status'],
    ]);
} catch (Throwable $error) {
    app_log('Create order failed', ['error' => $error->getMessage()]);
    json_response(['ok' => false, 'error' => $error->getMessage()], 400);
}
