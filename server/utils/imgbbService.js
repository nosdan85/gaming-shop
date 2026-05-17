const axios = require('axios');

const IMGBB_API_URL = 'https://api.imgbb.com/1/upload';

/**
 * Upload an image buffer to imgbb and return the CDN URL.
 * Falls back to null if imgbb fails (caller handles local storage as fallback).
 */
const uploadToImgbb = async (buffer, filename = 'image.jpg') => {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) return null;

    try {
        const base64 = buffer.toString('base64');
        const response = await axios.post(
            IMGBB_API_URL,
            { image: base64, name: filename },
            { params: { key: apiKey }, timeout: 20000 }
        );
        if (response.data?.data?.url) return response.data.data.url;
        return null;
    } catch (error) {
        console.error('[imgbb] Upload failed:', error?.response?.data?.error?.message || error.message);
        return null;
    }
};

module.exports = { uploadToImgbb };
