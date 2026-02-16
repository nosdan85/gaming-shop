const axios = require('axios');
const User = require('../models/User');

exports.discordCallback = async (req, res) => {
    const { code } = req.body;

    if (!code) return res.status(400).json({ message: "No code provided" });

    try {
        // 1. Đổi Code lấy Access Token
        const tokenResponse = await axios.post(
            'https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.DISCORD_REDIRECT_URI,
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token } = tokenResponse.data;

        // 2. Lấy thông tin User từ Discord
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` },
        });

        const { id, username, discriminator } = userResponse.data;
        const fullUsername = discriminator === '0' ? username : `${username}#${discriminator}`;

        // 3. Lưu hoặc Update vào Database
        let user = await User.findOne({ discordId: id });
        if (!user) {
            user = new User({ discordId: id, discordUsername: fullUsername });
        } else {
            user.discordUsername = fullUsername; // Cập nhật tên mới nhất
        }
        await user.save();

        res.json(user);

    } catch (error) {
        console.error("Discord Auth Error:", error.response?.data || error.message);
        res.status(500).json({ message: "Authentication failed" });
    }
};