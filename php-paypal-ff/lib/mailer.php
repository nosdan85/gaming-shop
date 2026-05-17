<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as MailException;

function load_phpmailer(): void
{
    $autoload = __DIR__ . '/../vendor/autoload.php';
    if (is_file($autoload)) {
        require_once $autoload;
        return;
    }

    throw new RuntimeException('PHPMailer is not installed. Run: composer install');
}

function mailer_from_settings(): PHPMailer
{
    load_phpmailer();

    $settings = get_settings([
        'smtp_host',
        'smtp_port',
        'smtp_secure',
        'smtp_user',
        'smtp_password',
        'mail_from',
        'paypal_email',
    ]);

    $host = trim($settings['smtp_host']);
    $user = trim($settings['smtp_user']);
    $password = (string)$settings['smtp_password'];
    if ($host === '' || $user === '' || $password === '') {
        throw new RuntimeException('SMTP settings are missing.');
    }

    $mail = new PHPMailer(true);
    $mail->CharSet = 'UTF-8';
    $mail->Encoding = 'base64';
    $mail->isSMTP();
    $mail->Host = $host;
    $mail->SMTPAuth = true;
    $mail->Username = $user;
    $mail->Password = $password;
    $mail->Port = max(1, (int)($settings['smtp_port'] ?: 587));

    $secure = strtolower(trim($settings['smtp_secure']));
    if ($secure === 'ssl' || $secure === 'tls') {
        $mail->SMTPSecure = $secure;
    }

    $from = trim($settings['mail_from']) ?: $settings['paypal_email'] ?: $user;
    $fromName = 'NosMarket';
    if (preg_match('/^(.+?)\s*<([^>]+)>$/', $from, $matches)) {
        $fromName = trim((string)$matches[1], "\"' ");
        $from = trim((string)$matches[2]);
    }
    $mail->setFrom($from, $fromName);
    return $mail;
}

function send_email(string $to, string $subject, string $body): bool
{
    $recipient = normalize_email($to);
    if ($recipient === '') {
        return false;
    }

    try {
        $mail = mailer_from_settings();
        $mail->addAddress($recipient);
        $mail->Subject = $subject;
        $mail->Body = $body;
        $mail->AltBody = strip_tags(str_replace(["<br>", "<br/>", "<br />"], "\n", $body));
        $mail->isHTML(true);
        return $mail->send();
    } catch (MailException | RuntimeException $error) {
        app_log('Email send failed', ['to' => $recipient, 'error' => $error->getMessage()]);
        return false;
    }
}

function send_payment_instruction_email(array $order): void
{
    $paypalEmail = paypal_receiver_email();
    $paymentUrl = app_base_url() . '/payment.php?id=' . rawurlencode((string)$order['id']);
    $body = '
        <p>Đơn hàng: <strong>' . h($order['id']) . '</strong></p>
        <p>Số tiền: <strong>' . h(number_format((float)$order['total'], 2)) . ' ' . h(app_currency()) . '</strong></p>
        <p>Email PayPal nhận tiền: <strong>' . h($paypalEmail) . '</strong></p>
        <p>Nội dung chuyển khoản: <code>' . h($order['memo_expected']) . '</code></p>
        <p>Vui lòng chuyển khoản chính xác số tiền và nội dung ghi chú bên trên để đơn hàng tự động xác nhận.</p>
        <p>Trang thanh toán: <a href="' . h($paymentUrl) . '">' . h($paymentUrl) . '</a></p>
    ';
    send_email((string)$order['customer_email'], 'Hướng dẫn thanh toán ' . $order['id'], $body);
}

function send_payment_confirmed_email(array $order): void
{
    $body = '
        <p>Thanh toán cho đơn <strong>' . h($order['id']) . '</strong> đã được xác nhận.</p>
        <p>Mã giao dịch PayPal: <strong>' . h($order['txn_id'] ?? '') . '</strong></p>
        <p>Cảm ơn bạn đã mua hàng tại NosMarket.</p>
    ';
    send_email((string)$order['customer_email'], 'Đã xác nhận thanh toán ' . $order['id'], $body);
}

function send_admin_alert(string $subject, string $message): void
{
    $adminEmail = normalize_email(get_setting('admin_email'));
    if ($adminEmail === '') {
        app_log('Admin alert skipped, admin_email missing', ['subject' => $subject, 'message' => $message]);
        return;
    }
    send_email($adminEmail, $subject, '<pre style="white-space:pre-wrap">' . h($message) . '</pre>');
}
