const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // tối đa 100 request
    message: { message: "Quá nhiều request từ IP này, vui lòng thử lại sau." }
});

const checkoutLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 giờ
    max: 10, // tối đa 10 đơn hàng/giờ
    message: { message: "Bạn đang tạo quá nhiều đơn hàng." }
});

module.exports = { apiLimiter, checkoutLimiter };