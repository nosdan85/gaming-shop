# PayPal Friends & Family Gmail Scanner Module

Module PHP thuần cho PayPal Family and Friends, không dùng PayPal API và không dùng IPN. Hệ thống xác nhận thanh toán bằng cách quét Gmail nhận email từ `service@paypal.com`.

## Yêu cầu server

- PHP 8.0+
- MySQL hoặc MariaDB
- PHP extensions: `pdo_mysql`, `imap`, `mbstring`
- Composer
- PHPMailer qua Composer

Gmail IMAP bắt buộc dùng SSL tới `imap.gmail.com:993`. Website/admin không bị module này ép HTTPS, nhưng không nên chạy admin và App Password qua HTTP công khai.

## Cài đặt

1. Cài thư viện:

```bash
cd php-paypal-ff
composer install --no-dev
```

2. Import database:

```bash
mysql -u USER -p DATABASE_NAME < schema.sql
```

3. Tạo config:

```bash
cp config.example.php config.php
```

Sửa `config.php`:

- DSN/user/password database
- `admin_password_hash`
- `base_url`
- `scanner_allowed_ips`

Tạo hash admin:

```bash
php -r "echo password_hash('your-admin-password', PASSWORD_DEFAULT), PHP_EOL;"
```

4. Vào admin:

```text
/admin/orders.php
```

Lưu settings:

- `paypal_email`: email PayPal nhận tiền
- `gmail_user`: Gmail nhận thông báo PayPal
- `gmail_app_password`: Google App Password
- `cron_interval`: mặc định 5 phút
- SMTP settings để gửi email hướng dẫn/xác nhận/cảnh báo
- `scan_token`: token nếu cần gọi scanner qua URL

5. Tạo Google App Password:

- Bật 2-Step Verification cho tài khoản Google.
- Google Account > Security > App passwords.
- Tạo app password cho Mail.
- Lưu giá trị đó vào `settings.gmail_app_password`, không dùng mật khẩu Gmail thường.

## Cron job

Chạy mỗi 5 phút:

```bash
*/5 * * * * /usr/bin/php /path/to/php-paypal-ff/paypal_scanner.php >> /path/to/php-paypal-ff/storage/logs/cron.log 2>&1
```

Nếu host không có cron, có thể gọi URL:

```text
https://www.nosmarket.com/paypal_scanner.php?token=YOUR_SCAN_TOKEN
```

URL mode cần `scan_token` đúng. Nếu `scanner_allowed_ips` trong config không rỗng, IP gọi URL cũng phải nằm trong allowlist.

## Tạo đơn hàng

Gửi POST JSON tới `create_order.php`:

```json
{
  "customer_email": "buyer@example.com",
  "products": [
    { "name": "Aizen V2", "price": 5, "quantity": 1 },
    { "name": "Trait Reroll", "price": 1.5, "quantity": 2 }
  ]
}
```

Response:

```json
{
  "ok": true,
  "order_id": "DH1002",
  "payment_url": "https://www.nosmarket.com/payment.php?id=DH1002",
  "paypal_email": "seller@example.com",
  "total": 8,
  "currency": "USD",
  "memo_expected": "Thanh toán đơn DH1002: Aizen V2, Trait Reroll",
  "payment_status": "pending"
}
```

Khách mở `payment_url`, copy đúng nội dung ghi chú, rồi chuyển PayPal F&F.

## Scanner hoạt động như sau

- Kết nối Gmail bằng IMAP SSL.
- Chỉ lấy email `UNSEEN` từ `service@paypal.com`.
- Chỉ xử lý subject chứa `Bạn đã nhận được tiền`, `You've received`, hoặc `You have received`.
- Lấy text/plain, fallback text/html rồi strip tags.
- Tách số tiền, người gửi, ghi chú, mã giao dịch.
- Tìm mã đơn `DHxxxx` trong ghi chú hoặc nội dung email.
- Đối chiếu đơn `payment_status = pending` và `memo_expected` chứa mã đơn.
- Nếu số tiền khớp sai số tối đa `0.01`, cập nhật đơn thành `paid`, lưu `txn_id`, gửi email xác nhận.
- Nếu không khớp, lưu `email_logs`, ghi log lỗi, gửi email cảnh báo admin nếu `admin_email` đã cấu hình.

Email đã xử lý sẽ được đánh dấu `SEEN`.
