CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  customer_email VARCHAR(190) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  products JSON NOT NULL,
  payment_method VARCHAR(32) NOT NULL DEFAULT 'paypal_ff',
  payment_status ENUM('pending', 'paid', 'cancelled') NOT NULL DEFAULT 'pending',
  memo_expected TEXT NOT NULL,
  txn_id VARCHAR(190) NULL,
  admin_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_orders_txn_id (txn_id),
  KEY idx_orders_payment_status_created (payment_status, created_at),
  KEY idx_orders_customer_email (customer_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  email_id VARCHAR(190) NOT NULL,
  subject VARCHAR(255) NOT NULL DEFAULT '',
  sender VARCHAR(255) NOT NULL DEFAULT '',
  order_id VARCHAR(32) NULL,
  txn_id VARCHAR(190) NULL,
  status ENUM('success', 'ignored', 'failed') NOT NULL DEFAULT 'ignored',
  message TEXT NULL,
  UNIQUE KEY uniq_email_logs_email_id (email_id),
  KEY idx_email_logs_timestamp (`timestamp`),
  KEY idx_email_logs_status (status),
  KEY idx_email_logs_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO settings (setting_key, setting_value) VALUES
  ('paypal_email', ''),
  ('gmail_user', ''),
  ('gmail_app_password', ''),
  ('cron_interval', '5'),
  ('next_order_number', '1002'),
  ('currency', 'USD'),
  ('scan_token', ''),
  ('admin_email', ''),
  ('smtp_host', ''),
  ('smtp_port', '587'),
  ('smtp_secure', 'tls'),
  ('smtp_user', ''),
  ('smtp_password', ''),
  ('mail_from', '')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);
