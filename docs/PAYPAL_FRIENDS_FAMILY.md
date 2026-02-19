# PayPal Friends & Family - Xác nhận thanh toán tự động

## Lưu ý: PayPal F&F KHÔNG có API chính thức

PayPal **Friends & Family** (F&F) là thanh toán người-đến-người. PayPal **không** cung cấp:
- Webhook cho thanh toán F&F
- Transaction API để xác nhận tự động
- Cách nào để web/bot của bạn biết khách đã thanh toán hay chưa

## Các lựa chọn

### Cách 1: Dùng "Pay with PayPal or Card" (Khuyến nghị)
Nút **Pay with PayPal or Card** dùng PayPal **Goods & Services** API. Nó:
- Tạo link thanh toán
- Tự động phát hiện khi khách thanh toán
- Cập nhật trạng thái đơn sang "Completed" qua webhook
- Không cần xác minh thủ công

**Đổi lại:** PayPal thu phí (~3%). F&F không phí nhưng phải xác minh thủ công.

### Cách 2: Xác minh thủ công (Luồng F&F hiện tại)
1. Khách xem email PayPal của bạn
2. Khách gửi F&F thủ công
3. Khách liên hệ bạn qua Discord
4. Bạn kiểm tra tài khoản PayPal
5. Bạn đánh dấu đơn đã thanh toán thủ công (qua Admin hoặc bot Discord)

### Cách 3: Dịch vụ bên thứ 3 (Không khuyến nghị)
Một số dịch vụ hứa thông báo khi PayPal nhận F&F. Các dịch vụ này thường:
- Vi phạm ToS của PayPal
- Yêu cầu chia sẻ thông tin đăng nhập PayPal
- Không ổn định

## Khuyến nghị
Dùng **Pay with PayPal or Card** nếu muốn xác nhận tự động. Dùng F&F làm lựa chọn không phí cho khách chấp nhận xác minh thủ công.
