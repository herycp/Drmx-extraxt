const express = require('express');
const cors = require('cors');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const app = express();
const PORT = process.env.PORT || 8000;

// 🌐 Konfigurasi Target Domain
const TARGET_HOST = 'https://pulvexa.space';
const FIXED_TOKEN = '5dfbc9b04e576fc6ad1dbe1daf7a';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

app.use(cors());

// 🛠️ Helper: Mengubah URL relatif di dalam file M3U8 menjadi URL absolut
function convertM3u8ToAbsolute(m3u8Text, baseUrlStr) {
    const baseUrl = new URL(baseUrlStr);
    return m3u8Text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        try {
            return new URL(trimmed, baseUrl.href).href;
        } catch (e) {
            return line;
        }
    }).join('\n');
}

app.get('/api/playlist', async (req, res) => {
    const { id: shortCode } = req.query;
    
    const requestId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const logPrefix = `[REQ-${requestId}]`;

    console.log(`\n==================================================`);
    console.log(`${logPrefix} 🚀 Request Playlist Baru | ID Video: ${shortCode}`);
    console.log(`==================================================`);

    if (!shortCode) {
        console.error(`${logPrefix} ❌ Validation Error: Parameter ?id= kosong.`);
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
        console.log(`${logPrefix} 🔍 [STEP 1] Embed URL: ${embedUrl}`);

        // 2. Fetch Embed HTML Page
        console.log(`${logPrefix} 📡 [STEP 2] Mengambil HTML halaman embed...`);
        const pageResponse = await globalThis.fetch(embedUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'Referer': TARGET_HOST + '/'
            }
        });

        console.log(`${logPrefix} 📊 [STEP 2 Status]: ${pageResponse.status} ${pageResponse.statusText}`);

        if (!pageResponse.ok) {
            const errBody = await pageResponse.text();
            console.error(`${logPrefix} ❌ [STEP 2 Error Body Preview]: ${errBody.substring(0, 300)}`);
            throw new Error(`Gagal mengambil halaman embed. Status HTTP: ${pageResponse.status}`);
        }

        const rawHtml = await pageResponse.text();
        const rawCookies = pageResponse.headers.getSetCookie 
            ? pageResponse.headers.getSetCookie().join('; ') 
            : (pageResponse.headers.get('set-cookie') || '');

        // 3. Ekstraksi ID Panjang
        const match = rawHtml.match(/getPlaylist\(\s*[`'"]([a-f0-9]{32})[`'"]\s*\)/i);
        const longId = match ? match[1] : null;

        if (!longId) {
            console.error(`${logPrefix} ❌ [STEP 3 Match Fail] Regex getPlaylist() tidak cocok dengan HTML.`);
            throw new Error('Gagal menemukan ID video panjang pada pemanggilan getPlaylist() di HTML embed.');
        }

        console.log(`${logPrefix} 🔑 [STEP 3] ID Panjang Ditemukan: ${longId}`);

        // 4. Clean Script Tags
        const cleanHtml = rawHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

        // 5. Inisialisasi JSDOM
        dom = new JSDOM(cleanHtml, {
            runScripts: 'dangerously',
            url: embedUrl,
            pretendToBeVisual: true
        });

        const { window } = dom;

        window.alert = () => {};
        if (window.location) {
            window.location.reload = () => {};
        }

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

        window.Headers = globalThis.Headers;
        window.Request = globalThis.Request;
        window.Response = globalThis.Response;
        window.TextEncoder = globalThis.TextEncoder;
        window.TextDecoder = globalThis.TextDecoder;
        window.URL = globalThis.URL;
        window.URLSearchParams = globalThis.URLSearchParams;
        window.Uint8Array = globalThis.Uint8Array;
        window.ArrayBuffer = globalThis.ArrayBuffer;

        // 6. Interceptor Fetch
        window.fetch = async function(resource, config = {}) {
            let urlStr = typeof resource === 'string' ? resource : (resource.url || resource.href || String(resource));

            if (!urlStr.startsWith('http')) {
                if (!urlStr.startsWith('/')) {
                    urlStr = '/' + urlStr;
                }
                urlStr = TARGET_HOST + urlStr;
            }

            console.log(`${logPrefix} 🌐 [JSDOM Fetch Outgoing]: ${config.method || 'GET'} -> ${urlStr}`);

            const mergedHeaders = {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': embedUrl,
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

        // 7. Eksekusi app.js
        window.eval(appJsContent);

        if (typeof window.getPlaylist !== 'function') {
            throw new Error('Fungsi window.getPlaylist tidak ditemukan setelah mengeksekusi app.js.');
        }

        console.log(`${logPrefix} ⚙️ Memanggil window.getPlaylist('${longId}')...`);
        const result = await window.getPlaylist(longId);

        console.log(`${logPrefix} 🔬 [RAW RESULT DUMP]:`, JSON.stringify(result, null, 2));

        // 8. Ekstraksi Target URL M3U8 dari Property 'encrypted'
        let m3u8TargetUrl = null;
        if (typeof result === 'string') {
            m3u8TargetUrl = result;
        } else if (result && typeof result === 'object') {
            m3u8TargetUrl = result.encrypted || result.file || result.url || result.playlist || (Array.isArray(result) && (result[0]?.file || result[0]?.url));
        }

        if (!m3u8TargetUrl) {
            console.error(`${logPrefix} ❌ [Ekstraksi Gagal] Hasil dari getPlaylist tidak memiliki property URL valid.`);
            throw new Error(`Gagal mengekstrak URL M3U8. Data yang diterima: ${JSON.stringify(result)}`);
        }

        // Tambahkan domain jika path berbentuk relatif (/playlist/e8e456...)
        if (!m3u8TargetUrl.startsWith('http')) {
            if (!m3u8TargetUrl.startsWith('/')) {
                m3u8TargetUrl = '/' + m3u8TargetUrl;
            }
            m3u8TargetUrl = TARGET_HOST + m3u8TargetUrl;
        }

        console.log(`${logPrefix} 🎯 Target Playlist URL: ${m3u8TargetUrl}`);

        // 9. Fetch File M3U8 Langsung
        console.log(`${logPrefix} 📥 Mengunduh M3U8 dari target URL...`);
        const m3u8Response = await globalThis.fetch(m3u8TargetUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': embedUrl,
                'Cookie': rawCookies,
                'Origin': TARGET_HOST,
                'Accept': '*/*'
            }
        });

        console.log(`${logPrefix} 📊 Status Download Playlist: ${m3u8Response.status} ${m3u8Response.statusText}`);

        if (!m3u8Response.ok) {
            const errText = await m3u8Response.text();
            console.error(`${logPrefix} ❌ Error Body: ${errText.substring(0, 300)}`);
            throw new Error(`Gagal mengunduh playlist. Status HTTP: ${m3u8Response.status}`);
        }

        const rawM3u8Text = await m3u8Response.text();

        // 10. Modifikasi URL Relatif Menjadi Absolut
        const modifiedM3u8 = convertM3u8ToAbsolute(rawM3u8Text, m3u8TargetUrl);
        console.log(`${logPrefix} ✅ Selesai! Mengirimkan file M3U8 ke user.`);

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Content-Disposition', `inline; filename="${shortCode}.m3u8"`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        return res.status(200).send(modifiedM3u8);

    } catch (error) {
        console.error(`\n==================================================`);
        console.error(`${logPrefix} 💥 [API ERROR EXCEPTION]`);
        console.error(`${logPrefix} Message: ${error.message}`);
        console.error(`${logPrefix} Stack Trace:\n`, error.stack);
        console.error(`==================================================\n`);

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
    res.json({ status: true, message: 'Server API M3U8 Proxy Aktif!' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Server berjalan pada port ${PORT}`);
});
