<?php

declare(strict_types=1);

session_start();
require_once __DIR__ . '/../lib/bootstrap.php';

function is_admin_logged_in(): bool
{
    return ($_SESSION['admin_logged_in'] ?? false) === true;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return (string)$_SESSION['csrf_token'];
}

function require_csrf(): void
{
    $token = (string)($_POST['csrf_token'] ?? '');
    if ($token === '' || !hash_equals(csrf_token(), $token)) {
        throw new RuntimeException('CSRF token không hợp lệ.');
    }
}

$flash = '';
$error = '';
$scanSummary = null;

if (isset($_GET['logout'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: orders.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $action = (string)($_POST['action'] ?? '');
        if ($action === 'login') {
            $password = (string)($_POST['password'] ?? '');
            $hash = (string)app_config('admin_password_hash', '');
            if ($hash !== '' && password_verify($password, $hash)) {
                $_SESSION['admin_logged_in'] = true;
                csrf_token();
                header('Location: orders.php');
                exit;
            }
            $error = 'Sai mật khẩu admin.';
        } elseif (!is_admin_logged_in()) {
            $error = 'Bạn cần đăng nhập.';
        } else {
            require_csrf();

            if ($action === 'mark_paid') {
                $orderId = (string)($_POST['order_id'] ?? '');
                $txnId = (string)($_POST['txn_id'] ?? '');
                $note = (string)($_POST['admin_notes'] ?? '');
                mark_order_paid($orderId, $txnId, 'Manual admin confirm. ' . $note);
                $flash = 'Đã xác nhận thủ công đơn ' . strtoupper($orderId) . '.';
            } elseif ($action === 'scan_now') {
                $scanSummary = run_paypal_scanner();
                $flash = 'Đã chạy quét Gmail thủ công.';
            } elseif ($action === 'save_settings') {
                $current = get_settings(['gmail_app_password', 'smtp_password']);
                $next = [
                    'paypal_email' => normalize_email($_POST['paypal_email'] ?? ''),
                    'gmail_user' => normalize_email($_POST['gmail_user'] ?? ''),
                    'gmail_app_password' => trim((string)($_POST['gmail_app_password'] ?? '')) !== ''
                        ? trim((string)$_POST['gmail_app_password'])
                        : $current['gmail_app_password'],
                    'cron_interval' => (string)max(1, (int)($_POST['cron_interval'] ?? 5)),
                    'currency' => strtoupper(trim((string)($_POST['currency'] ?? 'USD'))),
                    'scan_token' => trim((string)($_POST['scan_token'] ?? '')),
                    'admin_email' => normalize_email($_POST['admin_email'] ?? ''),
                    'smtp_host' => trim((string)($_POST['smtp_host'] ?? '')),
                    'smtp_port' => (string)max(1, (int)($_POST['smtp_port'] ?? 587)),
                    'smtp_secure' => strtolower(trim((string)($_POST['smtp_secure'] ?? 'tls'))),
                    'smtp_user' => trim((string)($_POST['smtp_user'] ?? '')),
                    'smtp_password' => trim((string)($_POST['smtp_password'] ?? '')) !== ''
                        ? trim((string)$_POST['smtp_password'])
                        : $current['smtp_password'],
                    'mail_from' => trim((string)($_POST['mail_from'] ?? '')),
                ];
                if (!preg_match('/^[A-Z]{3}$/', $next['currency'])) {
                    $next['currency'] = 'USD';
                }
                set_settings($next);
                $flash = 'Đã lưu cấu hình.';
            }
        }
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}

if (!is_admin_logged_in()):
?>
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin Orders</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
  <main class="container py-5">
    <div class="row justify-content-center">
      <div class="col-md-5">
        <div class="card shadow-sm">
          <div class="card-body p-4">
            <h1 class="h4 mb-3">Admin Orders</h1>
            <?php if ($error): ?><div class="alert alert-danger"><?= h($error) ?></div><?php endif; ?>
            <form method="post">
              <input type="hidden" name="action" value="login">
              <div class="mb-3">
                <label class="form-label">Mật khẩu</label>
                <input class="form-control" type="password" name="password" required>
              </div>
              <button class="btn btn-primary w-100" type="submit">Đăng nhập</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </main>
</body>
</html>
<?php
exit;
endif;

$settings = get_settings([
    'paypal_email',
    'gmail_user',
    'cron_interval',
    'currency',
    'scan_token',
    'admin_email',
    'smtp_host',
    'smtp_port',
    'smtp_secure',
    'smtp_user',
    'mail_from',
]);
$query = trim((string)($_GET['q'] ?? ''));
$orders = list_orders($query, 150);
$logs = recent_email_logs(50);
?>
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin Orders</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
  <nav class="navbar navbar-expand-lg bg-white border-bottom">
    <div class="container-fluid">
      <span class="navbar-brand">NosMarket Orders</span>
      <a class="btn btn-outline-secondary btn-sm" href="?logout=1">Đăng xuất</a>
    </div>
  </nav>

  <main class="container-fluid py-4">
    <?php if ($flash): ?><div class="alert alert-success"><?= h($flash) ?></div><?php endif; ?>
    <?php if ($error): ?><div class="alert alert-danger"><?= h($error) ?></div><?php endif; ?>
    <?php if ($scanSummary): ?>
      <pre class="alert alert-info"><?= h(json_encode($scanSummary, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)) ?></pre>
    <?php endif; ?>

    <div class="row g-4">
      <div class="col-xl-8">
        <div class="card shadow-sm">
          <div class="card-body">
            <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
              <form class="d-flex gap-2" method="get">
                <input class="form-control" type="search" name="q" value="<?= h($query) ?>" placeholder="Tìm mã đơn hoặc email">
                <button class="btn btn-outline-primary" type="submit">Tìm kiếm</button>
              </form>
              <form method="post">
                <input type="hidden" name="csrf_token" value="<?= h(csrf_token()) ?>">
                <input type="hidden" name="action" value="scan_now">
                <button class="btn btn-primary" type="submit">Quét ngay</button>
              </form>
            </div>

            <div class="table-responsive">
              <table class="table table-hover align-middle">
                <thead>
                  <tr>
                    <th>Mã đơn</th>
                    <th>Email</th>
                    <th>Sản phẩm</th>
                    <th>Tổng</th>
                    <th>Trạng thái</th>
                    <th>Txn</th>
                    <th style="min-width: 260px;">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  <?php foreach ($orders as $order): ?>
                    <?php $products = json_decode((string)$order['products'], true) ?: []; ?>
                    <tr>
                      <td><code><?= h($order['id']) ?></code></td>
                      <td class="small"><?= h($order['customer_email']) ?></td>
                      <td class="small">
                        <?php foreach ($products as $product): ?>
                          <div><?= h($product['name'] ?? '') ?> x<?= h($product['quantity'] ?? 1) ?></div>
                        <?php endforeach; ?>
                        <div class="text-muted text-break"><?= h($order['memo_expected']) ?></div>
                      </td>
                      <td><?= h(number_format((float)$order['total'], 2)) ?> <?= h(app_currency()) ?></td>
                      <td>
                        <?php if ($order['payment_status'] === 'paid'): ?>
                          <span class="badge text-bg-success">paid</span>
                        <?php elseif ($order['payment_status'] === 'cancelled'): ?>
                          <span class="badge text-bg-secondary">cancelled</span>
                        <?php else: ?>
                          <span class="badge text-bg-danger">pending</span>
                        <?php endif; ?>
                      </td>
                      <td class="small text-break"><?= h($order['txn_id'] ?? '') ?></td>
                      <td>
                        <?php if ($order['payment_status'] !== 'paid'): ?>
                          <form class="row g-2" method="post">
                            <input type="hidden" name="csrf_token" value="<?= h(csrf_token()) ?>">
                            <input type="hidden" name="action" value="mark_paid">
                            <input type="hidden" name="order_id" value="<?= h($order['id']) ?>">
                            <div class="col-12">
                              <input class="form-control form-control-sm" name="txn_id" placeholder="PayPal txn_id" required>
                            </div>
                            <div class="col-12">
                              <input class="form-control form-control-sm" name="admin_notes" placeholder="Ghi chú admin">
                            </div>
                            <div class="col-12">
                              <button class="btn btn-sm btn-success" type="submit">Xác nhận thủ công</button>
                            </div>
                          </form>
                        <?php else: ?>
                          <span class="text-muted small">Đã thanh toán</span>
                        <?php endif; ?>
                      </td>
                    </tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card shadow-sm mt-4">
          <div class="card-body">
            <h2 class="h5">Lịch sử quét email</h2>
            <div class="table-responsive">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Email ID</th>
                    <th>Subject</th>
                    <th>Sender</th>
                    <th>Status</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  <?php foreach ($logs as $log): ?>
                    <tr>
                      <td class="small"><?= h($log['timestamp']) ?></td>
                      <td class="small text-break"><?= h($log['email_id']) ?></td>
                      <td class="small"><?= h($log['subject']) ?></td>
                      <td class="small"><?= h($log['sender']) ?></td>
                      <td>
                        <span class="badge <?= $log['status'] === 'success' ? 'text-bg-success' : ($log['status'] === 'failed' ? 'text-bg-danger' : 'text-bg-secondary') ?>">
                          <?= h($log['status']) ?>
                        </span>
                      </td>
                      <td class="small"><?= h($log['message']) ?></td>
                    </tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-4">
        <div class="card shadow-sm">
          <div class="card-body">
            <h2 class="h5">Cấu hình</h2>
            <form method="post">
              <input type="hidden" name="csrf_token" value="<?= h(csrf_token()) ?>">
              <input type="hidden" name="action" value="save_settings">
              <div class="mb-2">
                <label class="form-label">PayPal email nhận tiền</label>
                <input class="form-control" name="paypal_email" value="<?= h($settings['paypal_email']) ?>">
              </div>
              <div class="row g-2">
                <div class="col-8">
                  <label class="form-label">Gmail user</label>
                  <input class="form-control" name="gmail_user" value="<?= h($settings['gmail_user']) ?>">
                </div>
                <div class="col-4">
                  <label class="form-label">Cron phút</label>
                  <input class="form-control" type="number" min="1" name="cron_interval" value="<?= h($settings['cron_interval']) ?>">
                </div>
              </div>
              <div class="mb-2 mt-2">
                <label class="form-label">Gmail App Password</label>
                <input class="form-control" type="password" name="gmail_app_password" placeholder="Để trống nếu không đổi">
              </div>
              <div class="row g-2">
                <div class="col-4">
                  <label class="form-label">Currency</label>
                  <input class="form-control" name="currency" value="<?= h($settings['currency'] ?: 'USD') ?>">
                </div>
                <div class="col-8">
                  <label class="form-label">URL scan token</label>
                  <input class="form-control" name="scan_token" value="<?= h($settings['scan_token']) ?>">
                </div>
              </div>
              <div class="mb-2 mt-2">
                <label class="form-label">Admin email cảnh báo</label>
                <input class="form-control" name="admin_email" value="<?= h($settings['admin_email']) ?>">
              </div>
              <hr>
              <div class="row g-2">
                <div class="col-8">
                  <label class="form-label">SMTP host</label>
                  <input class="form-control" name="smtp_host" value="<?= h($settings['smtp_host']) ?>">
                </div>
                <div class="col-4">
                  <label class="form-label">Port</label>
                  <input class="form-control" type="number" name="smtp_port" value="<?= h($settings['smtp_port'] ?: '587') ?>">
                </div>
              </div>
              <div class="row g-2 mt-1">
                <div class="col-4">
                  <label class="form-label">Secure</label>
                  <select class="form-select" name="smtp_secure">
                    <?php foreach (['tls', 'ssl', 'none'] as $secure): ?>
                      <option value="<?= h($secure) ?>" <?= $settings['smtp_secure'] === $secure ? 'selected' : '' ?>><?= h($secure) ?></option>
                    <?php endforeach; ?>
                  </select>
                </div>
                <div class="col-8">
                  <label class="form-label">SMTP user</label>
                  <input class="form-control" name="smtp_user" value="<?= h($settings['smtp_user']) ?>">
                </div>
              </div>
              <div class="mb-2 mt-2">
                <label class="form-label">SMTP password</label>
                <input class="form-control" type="password" name="smtp_password" placeholder="Để trống nếu không đổi">
              </div>
              <div class="mb-3">
                <label class="form-label">Mail from</label>
                <input class="form-control" name="mail_from" value="<?= h($settings['mail_from']) ?>">
              </div>
              <button class="btn btn-primary w-100" type="submit">Lưu cấu hình</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </main>
</body>
</html>
