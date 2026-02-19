# PayPal Friends & Family

## PayPal F&F không có API tự động

PayPal **Friends & Family** không cung cấp webhook hay API. Không có cách nào để web/bot tự động biết khách đã thanh toán.

## Thanh toán TỰ ĐỘNG: "Pay with PayPal or Card"

Nút **Pay with PayPal or Card** dùng PayPal Goods & Services (tự động, không ticket).

## PayPal F&F (luồng hiện tại)

1. Khách chọn F&F → hiện email + tạo ticket **paypal_1**, **paypal_2**... (cùng category với ticket CashApp/Robux)
2. Web dẫn đến ticket: Desktop (theo cách liên kết: web→mở web, app→mở app), Điện thoại→mở app
3. Khách gửi tiền, upload screenshot trong ticket
4. Bạn xác minh thủ công, dùng !close trong ticket khi đã nhận tiền
