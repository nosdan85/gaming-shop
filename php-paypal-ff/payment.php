<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';

$orderId = strtoupper(trim((string)($_GET['id'] ?? '')));
$order = $orderId !== '' ? find_order($orderId) : null;
if (!$order) {
    http_response_code(404);
}

$products = $order ? json_decode((string)$order['products'], true) : [];
$products = is_array($products) ? $products : [];
?>
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Thanh toán PayPal F&F</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
  <main class="container py-5">
    <div class="row justify-content-center">
      <div class="col-lg-7">
        <div class="card shadow-sm">
          <div class="card-body p-4">
            <?php if (!$order): ?>
              <h1 class="h4 mb-3">Không tìm thấy đơn hàng</h1>
              <p class="text-muted mb-0">Link thanh toán không hợp lệ hoặc đơn hàng đã bị xóa.</p>
            <?php else: ?>
              <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
                <div>
                  <h1 class="h4 mb-1">Thanh toán PayPal Friends & Family</h1>
                  <p class="text-muted mb-0">Đơn hàng <strong><?= h($order['id']) ?></strong></p>
                </div>
                <span class="badge <?= $order['payment_status'] === 'paid' ? 'text-bg-success' : 'text-bg-danger' ?>">
                  <?= $order['payment_status'] === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán' ?>
                </span>
              </div>

              <div class="border rounded p-3 mb-3 bg-white">
                <div class="mb-2">
                  <div class="text-muted small">Email PayPal nhận tiền</div>
                  <div class="d-flex gap-2">
                    <code class="flex-grow-1" id="paypalEmail"><?= h(paypal_receiver_email()) ?></code>
                    <button class="btn btn-sm btn-outline-secondary" type="button" data-copy="#paypalEmail">Copy</button>
                  </div>
                </div>
                <div class="mb-2">
                  <div class="text-muted small">Số tiền</div>
                  <div class="fs-5 fw-semibold"><?= h(number_format((float)$order['total'], 2)) ?> <?= h(app_currency()) ?></div>
                </div>
                <div>
                  <div class="text-muted small">Nội dung chuyển khoản</div>
                  <div class="d-flex gap-2">
                    <code class="flex-grow-1 text-break" id="memoExpected"><?= h($order['memo_expected']) ?></code>
                    <button class="btn btn-sm btn-primary" type="button" data-copy="#memoExpected">Copy nội dung</button>
                  </div>
                </div>
              </div>

              <div class="alert alert-warning">
                Vui lòng chuyển khoản chính xác số tiền và nội dung ghi chú bên trên để đơn hàng tự động xác nhận.
              </div>

              <?php if ($products !== []): ?>
                <h2 class="h6">Sản phẩm</h2>
                <ul class="list-group mb-3">
                  <?php foreach ($products as $product): ?>
                    <li class="list-group-item d-flex justify-content-between">
                      <span><?= h($product['name'] ?? '') ?> x<?= h($product['quantity'] ?? 1) ?></span>
                      <span><?= h(number_format((float)($product['price'] ?? 0), 2)) ?></span>
                    </li>
                  <?php endforeach; ?>
                </ul>
              <?php endif; ?>
            <?php endif; ?>
          </div>
        </div>
      </div>
    </div>
  </main>
  <script>
    document.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', async () => {
        const target = document.querySelector(button.getAttribute('data-copy'));
        if (!target) return;
        await navigator.clipboard.writeText(target.textContent.trim());
        const old = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = old; }, 1500);
      });
    });
  </script>
</body>
</html>
