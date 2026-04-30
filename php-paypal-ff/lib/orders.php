<?php

declare(strict_types=1);

function normalize_products(mixed $products): array
{
    if (is_string($products)) {
        $decoded = json_decode($products, true);
        $products = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($products)) {
        return [];
    }

    $normalized = [];
    foreach ($products as $product) {
        if (!is_array($product)) {
            continue;
        }
        $name = trim((string)($product['name'] ?? ''));
        $price = (float)($product['price'] ?? 0);
        $quantity = max(1, (int)($product['quantity'] ?? 1));
        if ($name === '' || $price <= 0) {
            continue;
        }
        $normalized[] = [
            'name' => $name,
            'price' => round($price, 2),
            'quantity' => $quantity,
        ];
    }
    return $normalized;
}

function products_total(array $products): float
{
    $total = 0.0;
    foreach ($products as $product) {
        $total += (float)$product['price'] * (int)$product['quantity'];
    }
    return round($total, 2);
}

function product_names_for_memo(array $products): string
{
    $names = [];
    foreach ($products as $product) {
        $names[] = (string)$product['name'];
    }
    return implode(', ', $names);
}

function next_order_id(): string
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'next_order_number' FOR UPDATE");
        $stmt->execute();
        $next = (int)($stmt->fetchColumn() ?: 1002);
        if ($next < 1) {
            $next = 1002;
        }

        $nextStmt = $pdo->prepare(
            "INSERT INTO settings (setting_key, setting_value) VALUES ('next_order_number', :next_value)
             ON DUPLICATE KEY UPDATE setting_value = :next_value"
        );
        $nextStmt->execute(['next_value' => (string)($next + 1)]);
        $pdo->commit();
        return 'DH' . $next;
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }
}

function build_memo_expected(string $orderId, array $products): string
{
    return 'Thanh toán đơn ' . $orderId . ': ' . product_names_for_memo($products);
}

function create_order(string $customerEmail, array $products): array
{
    $customerEmail = normalize_email($customerEmail);
    if (!filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
        throw new InvalidArgumentException('Email khách hàng không hợp lệ.');
    }
    if ($products === []) {
        throw new InvalidArgumentException('Giỏ hàng trống hoặc dữ liệu sản phẩm không hợp lệ.');
    }

    $orderId = next_order_id();
    $total = products_total($products);
    $memoExpected = build_memo_expected($orderId, $products);

    $stmt = db()->prepare(
        'INSERT INTO orders
            (id, customer_email, total, products, payment_method, payment_status, memo_expected)
         VALUES
            (:id, :customer_email, :total, :products, :payment_method, :payment_status, :memo_expected)'
    );
    $stmt->execute([
        'id' => $orderId,
        'customer_email' => $customerEmail,
        'total' => $total,
        'products' => json_encode($products, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'payment_method' => 'paypal_ff',
        'payment_status' => 'pending',
        'memo_expected' => $memoExpected,
    ]);

    $order = find_order($orderId);
    if ($order) {
        send_payment_instruction_email($order);
        return $order;
    }

    throw new RuntimeException('Không tạo được đơn hàng.');
}

function find_order(string $orderId): ?array
{
    $stmt = db()->prepare('SELECT * FROM orders WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => strtoupper(trim($orderId))]);
    $order = $stmt->fetch();
    return $order ?: null;
}

function find_pending_order_by_code(string $orderId): ?array
{
    $stmt = db()->prepare(
        "SELECT * FROM orders
         WHERE id = :id
           AND payment_status = 'pending'
           AND memo_expected LIKE :memo
         LIMIT 1"
    );
    $stmt->execute([
        'id' => strtoupper(trim($orderId)),
        'memo' => '%' . strtoupper(trim($orderId)) . '%',
    ]);
    $order = $stmt->fetch();
    return $order ?: null;
}

function mark_order_paid(string $orderId, string $txnId, string $adminNotes = ''): array
{
    $txnId = trim($txnId);
    if ($txnId === '') {
        throw new InvalidArgumentException('txn_id không được trống.');
    }

    $stmt = db()->prepare(
        "UPDATE orders
         SET payment_status = 'paid',
             txn_id = :txn_id,
             admin_notes = CONCAT(COALESCE(admin_notes, ''), :admin_notes)
         WHERE id = :id"
    );
    $stmt->execute([
        'id' => strtoupper(trim($orderId)),
        'txn_id' => $txnId,
        'admin_notes' => $adminNotes === '' ? '' : "\n" . date('c') . ' ' . $adminNotes,
    ]);

    $order = find_order($orderId);
    if (!$order) {
        throw new RuntimeException('Không tìm thấy đơn hàng.');
    }
    if ($stmt->rowCount() > 0) {
        send_payment_confirmed_email($order);
    }
    return $order;
}

function list_orders(string $query = '', int $limit = 100): array
{
    $query = trim($query);
    if ($query !== '') {
        $like = '%' . $query . '%';
        $stmt = db()->prepare(
            'SELECT * FROM orders
             WHERE id LIKE :q OR customer_email LIKE :q
             ORDER BY created_at DESC
             LIMIT :limit'
        );
        $stmt->bindValue('q', $like);
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    $stmt = db()->prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT :limit');
    $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}
