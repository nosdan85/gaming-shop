const normalizeEnvValue = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (
        (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith("'") && text.endsWith("'"))
    ) {
        return text.slice(1, -1).trim();
    }
    return text;
};

const getDiscordGatewayStatus = () => {
    const isVercelRuntime = normalizeEnvValue(process.env.VERCEL) === '1';
    const gatewayFlag = normalizeEnvValue(process.env.DISCORD_ENABLE_GATEWAY).toLowerCase();
    const gatewayEnabled = gatewayFlag === 'true' || (gatewayFlag !== 'false' && !isVercelRuntime);

    return {
        isVercelRuntime,
        gatewayFlag,
        gatewayEnabled
    };
};

module.exports = {
    getDiscordGatewayStatus
};
