const express = require('express');
const cors = require('cors');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const app = express();
const PORT = process.env.PORT || 8000;

const TARGET_HOST = 'https://pulvexa.space';
const FIXED_TOKEN = '5dfbc9b04e576fc6ad1dbe1daf7a';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

app.use(cors());

app.get('/api/playlist', async (req, res) => {
    // Terima parameter kode pendek (contoh: ?id=ZReJmz7rUX)
    const { id: shortCode } = req.query;

    if (!shortCode) {
        return res.status(400).json({ 
            status: false, 
            message: 'Parameter ?id= (kode video) wajib diisi' 
        });
    }

    let dom = null;

    try {
        const appJsPath = path.join(__dirname, 'app.js');
        if (!fs.existsSync(appJsPath)) {
            throw new Error('File app.js tidak ditemukan di server.');
        }
        const appJsContent = fs.readFileSync(appJsPath, 'utf8');

        // 1. Rekonstruksi Full Embed URL
        const embedUrl = `${TARGET_HOST}/embed/${shortCode}?token=${FIXED_TOKEN}`;
        console.log(`\n🔍 [STEP 1] Rekonstruksi Full Embed URL: ${embedUrl}`);

        // 2. Download HTML Halaman Embed untuk Mendapatkan ID Panjang & Cookie
        const pageResponse = await globalThis.fetch(embedUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'Referer': TARGET_HOST + '/'
            }
        });

        if (!pageResponse.ok) {
            throw new Error(`Gagal mengambil halaman embed. Status: ${pageResponse.status}`);
        }

        const rawHtml = await pageResponse.text();

        // Tangkap Cookie Session dari response
        const rawCookies = pageResponse.headers.getSetCookie 
            ? pageResponse.headers.getSetCookie().join('; ') 
            : (pageResponse.headers.get('set-cookie') || '');

        // 3. Ekstraksi ID Panjang Langsung dari Pemanggilan getPlaylist(...)
        const match = rawHtml.match(/getPlaylist\(\s*[`'"]([a-f0-9]{32})[`'"]\s*\)/i);
        const longId = match ? match[1] : null;

        if (!longId) {
            throw new Error('Gagal menemukan ID video panjang pada pemanggilan getPlaylist() di HTML embed.');
        }

        console.log(`🔑 [STEP 2] ID Video Panjang Ditemukan: ${longId}`);

        // 4. Bersihkan Tag <script> Bawaan HTML Agar Tidak Memicu Reload / Alert
        const cleanHtml = rawHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

        // 5. Inisialisasi JSDOM
        dom = new JSDOM(cleanHtml, {
            runScripts: 'dangerously',
            url: embedUrl,
            pretendToBeVisual: true
        });

        const { window } = dom;

        // Mocking Fungsi Pengganggu Bawaan Browser
        window.alert = () => {};
        if (window.location) {
            window.location.reload = () => {};
        }

        // Mocking Environment Navigator & Screen
        Object.defineProperty(window, 'navigator', {
            value: {
                userAgent: USER_AGENT,
                appVersion: USER_AGENT,
                platform: 'Win32',
                language: 'en-US',
                languages: ['en-US', 'en'],
                cookieEnabled: true,
                onLine: true
            },
            writable: true,
            configurable: true
        });

        Object.defineProperty(window, 'screen', {
            value: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
            writable: true,
            configurable: true
        });

        Object.defineProperty(window, 'crypto', {
            value: crypto.webcrypto || globalThis.crypto,
            configurable: true,
            writable: true
        });

        // Inject Web Polyfills
        window.Headers = globalThis.Headers;
        window.Request = globalThis.Request;
        window.Response = globalThis.Response;
        window.TextEncoder = globalThis.TextEncoder;
        window.TextDecoder = globalThis.TextDecoder;
        window.URL = globalThis.URL;
        window.URLSearchParams = globalThis.URLSearchParams;
        window.Uint8Array = globalThis.Uint8Array;
        window.ArrayBuffer = globalThis.ArrayBuffer;

        // 6. Interceptor Fetch dengan Referer FULL EMBED URL & Cookie
        window.fetch = async function(resource, config = {}) {
            let urlStr = typeof resource === 'string' ? resource : (resource.url || resource.href || String(resource));

            if (!urlStr.startsWith('http')) {
                if (!urlStr.startsWith('/')) {
                    urlStr = '/' + urlStr;
                }
                urlStr = TARGET_HOST + urlStr;
            }

            console.log(`🌐 [Fetch Outgoing]: ${urlStr}`);

            const mergedHeaders = {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': embedUrl, // Referer resmi hasil rekonstruksi
                'Origin': TARGET_HOST,
                'Cookie': rawCookies,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                ...(config.headers || {})
            };

            return await globalThis.fetch(urlStr, {
                ...config,
                headers: mergedHeaders
            });
        };

        // 7. Inject & Eksekusi app.js
        const scriptEl = window.document.createElement('script');
        scriptEl.src = `${TARGET_HOST}/app.js?v=8899`;
        scriptEl.textContent = appJsContent;
        window.document.body.appendChild(scriptEl);

        if (typeof window.getPlaylist !== 'function') {
            throw new Error('Fungsi window.getPlaylist tidak ditemukan di app.js');
        }

        console.log(`⚙️ [STEP 3] Memproses window.getPlaylist('${longId}')...`);
        const result = await window.getPlaylist(longId);

        return res.json({
            status: true,
            code: shortCode,
            long_id: longId,
            data: result
        });

    } catch (error) {
        console.error('[API ERROR]:', error.message);
        return res.status(500).json({
            status: false,
            message: 'Gagal memproses playlist',
            error: error.message
        });
    } finally {
        if (dom && dom.window) {
            dom.window.close();
        }
    }
});

app.get('/', (req, res) => {
    res.json({ status: true, message: 'Server API Playlist Aktif!' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Server berjalan pada port ${PORT}`);
});
