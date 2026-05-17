<?php

declare(strict_types=1);

function scanner_mailbox_host(): string
{
    return '{imap.gmail.com:993/imap/ssl}INBOX';
}

function subject_is_paypal_payment(string $subject): bool
{
    $subject = mb_strtolower($subject, 'UTF-8');
    return str_contains($subject, 'bạn đã nhận được tiền')
        || str_contains($subject, 'ban da nhan duoc tien')
        || str_contains($subject, "you've received")
        || str_contains($subject, 'you have received');
}

function decode_mime_header_value(string $value): string
{
    $decodedParts = imap_mime_header_decode($value);
    $decoded = '';
    foreach ($decodedParts as $part) {
        $charset = strtoupper((string)($part->charset ?? 'UTF-8'));
        $text = (string)($part->text ?? '');
        if ($charset !== 'DEFAULT' && $charset !== 'UTF-8') {
            $converted = @mb_convert_encoding($text, 'UTF-8', $charset);
            $decoded .= $converted !== false ? $converted : $text;
        } else {
            $decoded .= $text;
        }
    }
    return trim($decoded);
}

function decode_imap_part(string $body, int $encoding, string $charset = 'UTF-8'): string
{
    if ($encoding === ENCBASE64) {
        $body = (string)base64_decode($body, true);
    } elseif ($encoding === ENCQUOTEDPRINTABLE) {
        $body = quoted_printable_decode($body);
    }

    $charset = strtoupper(trim($charset ?: 'UTF-8'));
    if ($charset !== 'UTF-8' && $charset !== 'DEFAULT') {
        $converted = @mb_convert_encoding($body, 'UTF-8', $charset);
        if ($converted !== false) {
            $body = $converted;
        }
    }
    return $body;
}

function part_charset(object $part): string
{
    foreach (['parameters', 'dparameters'] as $property) {
        if (empty($part->{$property}) || !is_array($part->{$property})) {
            continue;
        }
        foreach ($part->{$property} as $param) {
            if (strtolower((string)($param->attribute ?? '')) === 'charset') {
                return (string)($param->value ?? 'UTF-8');
            }
        }
    }
    return 'UTF-8';
}

function collect_message_parts($imap, int $uid, object $structure, string $prefix = ''): array
{
    $parts = [];
    if (!empty($structure->parts) && is_array($structure->parts)) {
        foreach ($structure->parts as $index => $part) {
            $partNumber = $prefix === '' ? (string)($index + 1) : $prefix . '.' . ($index + 1);
            $parts = array_merge($parts, collect_message_parts($imap, $uid, $part, $partNumber));
        }
        return $parts;
    }

    $partNumber = $prefix === '' ? '1' : $prefix;
    $body = imap_fetchbody($imap, (string)$uid, $partNumber, FT_UID | FT_PEEK);
    if ($body === false && $partNumber === '1') {
        $body = imap_body($imap, (string)$uid, FT_UID | FT_PEEK);
    }
    if ($body === false) {
        return [];
    }

    $subtype = strtolower((string)($structure->subtype ?? ''));
    $type = (int)($structure->type ?? TYPETEXT);
    $parts[] = [
        'type' => $type,
        'subtype' => $subtype,
        'body' => decode_imap_part((string)$body, (int)($structure->encoding ?? ENC7BIT), part_charset($structure)),
    ];
    return $parts;
}

function extract_message_text($imap, int $uid): string
{
    $structure = imap_fetchstructure($imap, (string)$uid, FT_UID);
    if (!$structure) {
        $body = imap_body($imap, (string)$uid, FT_UID | FT_PEEK);
        return trim((string)$body);
    }

    $parts = collect_message_parts($imap, $uid, $structure);
    foreach ($parts as $part) {
        if ($part['type'] === TYPETEXT && $part['subtype'] === 'plain') {
            return trim((string)$part['body']);
        }
    }
    foreach ($parts as $part) {
        if ($part['type'] === TYPETEXT && $part['subtype'] === 'html') {
            return trim(html_entity_decode(strip_tags((string)$part['body']), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        }
    }
    return trim((string)($parts[0]['body'] ?? ''));
}

function normalize_email_text(string $text): string
{
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    $text = preg_replace('/[ \t]+/u', ' ', $text) ?? $text;
    return trim($text);
}

function parse_money_value(string $raw): float
{
    $value = preg_replace('/[^\d,.\-]/', '', $raw) ?? '';
    if ($value === '') {
        return 0.0;
    }

    $lastDot = strrpos($value, '.');
    $lastComma = strrpos($value, ',');
    if ($lastDot !== false && $lastComma !== false) {
        $decimal = $lastDot > $lastComma ? '.' : ',';
        $thousands = $decimal === '.' ? ',' : '.';
        $value = str_replace($thousands, '', $value);
        $value = str_replace($decimal, '.', $value);
        return round((float)$value, 2);
    }

    if ($lastComma !== false) {
        $digitsAfter = strlen($value) - $lastComma - 1;
        $value = $digitsAfter === 2 ? str_replace(',', '.', $value) : str_replace(',', '', $value);
        return round((float)$value, 2);
    }

    if ($lastDot !== false) {
        $digitsAfter = strlen($value) - $lastDot - 1;
        $value = $digitsAfter === 2 ? $value : str_replace('.', '', $value);
        return round((float)$value, 2);
    }

    return round((float)$value, 2);
}

function extract_amount_and_currency(string $text): array
{
    $normalized = normalize_email_text($text);
    $patterns = [
        '/(?:Số tiền|So tien|Amount)\s*[:\-]?\s*(?:[$€₫]|USD|VND|EUR)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})|[0-9]+(?:[.,][0-9]{2})?)\s*(USD|VND|EUR)?/iu',
        '/(?:Bạn đã nhận được|Ban da nhan duoc|Received|You(?:\'ve| have) received)[^\d]{0,120}(?:[$€₫]|USD|VND|EUR)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})|[0-9]+(?:[.,][0-9]{2})?)\s*(USD|VND|EUR)?/iu',
        '/(USD|VND|EUR)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})|[0-9]+(?:[.,][0-9]{2})?)/iu',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $normalized, $matches)) {
            if (preg_match('/^(USD|VND|EUR)$/i', $matches[1] ?? '')) {
                return [
                    'amount' => parse_money_value($matches[2] ?? ''),
                    'currency' => strtoupper($matches[1]),
                ];
            }
            return [
                'amount' => parse_money_value($matches[1] ?? ''),
                'currency' => strtoupper($matches[2] ?? ''),
            ];
        }
    }

    return ['amount' => 0.0, 'currency' => ''];
}

function extract_labeled_line(string $text, array $labels): string
{
    $labelPattern = implode('|', array_map(static fn($label) => preg_quote($label, '/'), $labels));
    if (preg_match('/^(?:' . $labelPattern . ')\s*[:\-]\s*(.+)$/imu', $text, $matches)) {
        return trim((string)$matches[1]);
    }
    if (preg_match('/(?:' . $labelPattern . ')\s*[:\-]\s*(.{1,300})/isu', $text, $matches)) {
        return trim(preg_split('/\n/u', (string)$matches[1])[0] ?? '');
    }
    return '';
}

function extract_paypal_email_fields(string $text): array
{
    $amount = extract_amount_and_currency($text);
    $memo = extract_labeled_line($text, ['Lời nhắn', 'Loi nhan', 'Ghi chú', 'Ghi chu', 'Note', 'Message']);
    $sender = extract_labeled_line($text, ['Người gửi', 'Nguoi gui', 'From', 'Sender']);
    $txnId = extract_labeled_line($text, ['Mã giao dịch', 'Ma giao dich', 'Transaction ID', 'Transaction number', 'Receipt ID']);

    if ($txnId === '' && preg_match('/\b[A-Z0-9]{12,20}\b/u', $text, $matches)) {
        $txnId = (string)$matches[0];
    }

    $orderId = '';
    if (preg_match('/\bDH\d+\b/iu', $memo, $matches)) {
        $orderId = strtoupper((string)$matches[0]);
    } elseif (preg_match('/\bDH\d+\b/iu', $text, $matches)) {
        $orderId = strtoupper((string)$matches[0]);
    }

    return [
        'amount' => (float)$amount['amount'],
        'currency' => (string)$amount['currency'],
        'memo' => $memo,
        'sender' => $sender,
        'txn_id' => trim($txnId),
        'order_id' => $orderId,
    ];
}

function log_email_scan(string $emailId, string $subject, string $sender, string $status, string $message, ?string $orderId = null, ?string $txnId = null): void
{
    $stmt = db()->prepare(
        'INSERT INTO email_logs (email_id, subject, sender, order_id, txn_id, status, message)
         VALUES (:email_id, :subject, :sender, :order_id, :txn_id, :status, :message)
         ON DUPLICATE KEY UPDATE
            `timestamp` = CURRENT_TIMESTAMP,
            subject = VALUES(subject),
            sender = VALUES(sender),
            order_id = VALUES(order_id),
            txn_id = VALUES(txn_id),
            status = VALUES(status),
            message = VALUES(message)'
    );
    $stmt->execute([
        'email_id' => mb_substr($emailId, 0, 190),
        'subject' => mb_substr($subject, 0, 255),
        'sender' => mb_substr($sender, 0, 255),
        'order_id' => $orderId,
        'txn_id' => $txnId,
        'status' => $status,
        'message' => $message,
    ]);
}

function process_paypal_email(array $email): array
{
    $fields = extract_paypal_email_fields($email['body']);
    $orderId = $fields['order_id'];
    $txnId = $fields['txn_id'];
    $logSender = $fields['sender'] !== '' ? $fields['sender'] : $email['sender'];

    if ($orderId === '') {
        $message = 'Không tìm thấy mã đơn DHxxxx trong ghi chú/email.';
        log_email_scan($email['email_id'], $email['subject'], $logSender, 'failed', $message);
        app_log('PayPal email mismatch', ['reason' => $message, 'subject' => $email['subject']]);
        send_admin_alert('PayPal email không khớp đơn', $message . "\nSubject: " . $email['subject']);
        return ['status' => 'failed', 'message' => $message];
    }

    $order = find_pending_order_by_code($orderId);
    if (!$order) {
        $message = 'Không tìm thấy đơn pending khớp mã ' . $orderId . '.';
        log_email_scan($email['email_id'], $email['subject'], $logSender, 'failed', $message, $orderId, $txnId ?: null);
        app_log('PayPal email mismatch', ['reason' => $message, 'order_id' => $orderId]);
        send_admin_alert('PayPal email không tìm thấy đơn', $message . "\nSubject: " . $email['subject']);
        return ['status' => 'failed', 'message' => $message, 'order_id' => $orderId];
    }

    $expectedCurrency = app_currency();
    $currency = $fields['currency'] !== '' ? $fields['currency'] : $expectedCurrency;
    if ($currency !== $expectedCurrency) {
        $message = 'Sai tiền tệ. Email=' . $currency . ', hệ thống=' . $expectedCurrency . '.';
        log_email_scan($email['email_id'], $email['subject'], $logSender, 'failed', $message, $orderId, $txnId ?: null);
        app_log('PayPal email mismatch', ['reason' => $message, 'order_id' => $orderId]);
        send_admin_alert('PayPal email sai tiền tệ', $message . "\nOrder: " . $orderId);
        return ['status' => 'failed', 'message' => $message, 'order_id' => $orderId];
    }

    $paidAmount = (float)$fields['amount'];
    $expectedAmount = (float)$order['total'];
    if (abs($paidAmount - $expectedAmount) > 0.01) {
        $message = 'Sai số tiền. Email=' . number_format($paidAmount, 2) . ', order=' . number_format($expectedAmount, 2) . '.';
        log_email_scan($email['email_id'], $email['subject'], $logSender, 'failed', $message, $orderId, $txnId ?: null);
        app_log('PayPal email mismatch', ['reason' => $message, 'order_id' => $orderId]);
        send_admin_alert('PayPal email sai số tiền', $message . "\nOrder: " . $orderId);
        return ['status' => 'failed', 'message' => $message, 'order_id' => $orderId];
    }

    if ($txnId === '') {
        $txnId = 'EMAIL-' . $email['email_id'];
    }

    $paidOrder = mark_order_paid($orderId, $txnId, 'Auto paid by Gmail scanner.');
    log_email_scan($email['email_id'], $email['subject'], $logSender, 'success', 'Đã xác nhận thanh toán.', $orderId, $txnId);
    return ['status' => 'success', 'message' => 'Đã xác nhận ' . $paidOrder['id'], 'order_id' => $orderId];
}

function run_paypal_scanner(): array
{
    if (!extension_loaded('imap')) {
        throw new RuntimeException('PHP IMAP extension is not enabled.');
    }

    $settings = get_settings(['gmail_user', 'gmail_app_password']);
    $gmailUser = trim($settings['gmail_user']);
    $gmailPassword = (string)$settings['gmail_app_password'];
    if ($gmailUser === '' || $gmailPassword === '') {
        throw new RuntimeException('gmail_user hoặc gmail_app_password chưa được cấu hình trong settings.');
    }

    $imap = @imap_open(scanner_mailbox_host(), $gmailUser, $gmailPassword, OP_READWRITE, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imap) {
        throw new RuntimeException('Không kết nối được Gmail IMAP: ' . imap_last_error());
    }

    $summary = ['seen' => 0, 'success' => 0, 'failed' => 0, 'ignored' => 0, 'messages' => []];
    try {
        $uids = imap_search($imap, 'UNSEEN FROM "service@paypal.com"', SE_UID) ?: [];
        foreach ($uids as $uid) {
            $uid = (int)$uid;
            $overview = imap_fetch_overview($imap, (string)$uid, FT_UID);
            $row = $overview[0] ?? null;
            if (!$row) {
                continue;
            }

            $subject = decode_mime_header_value((string)($row->subject ?? ''));
            $sender = decode_mime_header_value((string)($row->from ?? ''));
            $emailId = trim((string)($row->message_id ?? '')) ?: ('uid-' . $uid);
            $summary['seen']++;

            if (!subject_is_paypal_payment($subject)) {
                log_email_scan($emailId, $subject, $sender, 'ignored', 'Subject không phải email nhận tiền PayPal.');
                $summary['ignored']++;
                imap_setflag_full($imap, (string)$uid, '\\Seen', ST_UID);
                continue;
            }

            $body = extract_message_text($imap, $uid);
            $result = process_paypal_email([
                'email_id' => $emailId,
                'subject' => $subject,
                'sender' => $sender,
                'body' => $body,
            ]);

            $summary[$result['status']] = (int)$summary[$result['status']] + 1;
            $summary['messages'][] = $result;
            imap_setflag_full($imap, (string)$uid, '\\Seen', ST_UID);
        }
    } finally {
        imap_close($imap);
    }

    return $summary;
}

function recent_email_logs(int $limit = 50): array
{
    $stmt = db()->prepare('SELECT * FROM email_logs ORDER BY `timestamp` DESC LIMIT :limit');
    $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}
