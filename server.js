const express = require('express');
const cors = require('cors');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const app = express();
const PORT = process.env.PORT || 8000;

// Domain target & User-Agent Konsisten
const TARGET_HOST = 'https://pulvexa.space';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

app.use(cors());

app.get('/api/playlist', async (req, res) => {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ 
            status: false, 
            message: 'Parameter ?id= wajib diisi' 
        });
    }

    let dom = null;

    try {
        const appJsPath = path.join(__dirname, 'app.js');
        if (!fs.existsSync(appJsPath)) {
            throw new Error('File app.js tidak ditemukan di server.');
        }
        const appJsContent = fs.readFileSync(appJsPath, 'utf8');

        // 1. Inisialisasi Virtual DOM
        dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
            runScripts: 'dangerously',
            url: TARGET_HOST,
            pretendToBeVisual: true
        });

        const { window } = dom;

        // 2. Mock Navigator
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

        // 3. Mock Screen
        Object.defineProperty(window, 'screen', {
            value: {
                width: 1920,
                height: 1080,
                availWidth: 1920,
                availHeight: 1040,
                colorDepth: 24,
                pixelDepth: 24
            },
            writable: true,
            configurable: true
        });

        // 4. Inject Web Crypto API
        Object.defineProperty(window, 'crypto', {
            value: crypto.webcrypto || globalThis.crypto,
            configurable: true,
            writable: true
        });

        // 5. Inject Polyfills
        window.Headers = globalThis.Headers;
        window.Request = globalThis.Request;
        window.Response = globalThis.Response;
        window.TextEncoder = globalThis.TextEncoder;
        window.TextDecoder = globalThis.TextDecoder;
        window.URL = globalThis.URL;
        window.URLSearchParams = globalThis.URLSearchParams;
        window.Uint8Array = globalThis.Uint8Array;
        window.ArrayBuffer = globalThis.ArrayBuffer;

        // 6. INTERCEPTOR FETCH DENGAN DEBUG LOGGING MENDETAIL
        window.fetch = async function(resource, config = {}) {
            let urlStr = typeof resource === 'string' ? resource : (resource.url || resource.href || String(resource));

            if (!urlStr.startsWith('http')) {
                if (!urlStr.startsWith('/')) {
                    urlStr = '/' + urlStr;
                }
                urlStr = TARGET_HOST + urlStr;
            }

            console.log(`\n================ [DEBUG FETCH REQUEST] ================`);
            console.log(`🌐 URL Target   : ${urlStr}`);
            console.log(`📩 Method       : ${config.method || 'GET'}`);

            const mergedHeaders = {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': TARGET_HOST + '/',
                'Origin': TARGET_HOST,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                ...(config.headers || {})
            };

            console.log(`🔑 Headers Sent :`, JSON.stringify(mergedHeaders, null, 2));

            const response = await globalThis.fetch(urlStr, {
                ...config,
                headers: mergedHeaders
            });

            console.log(`📊 Status Code  : ${response.status} ${response.statusText}`);

            // Clone response agar tidak mengganggu proses app.js
            try {
                const clone = response.clone();
                const rawText = await clone.text();
                
                console.log(`\n📦 --- [RAW RESPONSE BEFORE DECODE] ---`);
                console.log(rawText);
                console.log(`-----------------------------------------\n`);
            } catch (err) {
                console.error(`[Debug Log Error]: Gagal membaca raw body:`, err.message);
            }

            return response;
        };

        // 7. Inject script app.js ke Virtual DOM
        const scriptEl = window.document.createElement('script');
        scriptEl.textContent = appJsContent;
        window.document.body.appendChild(scriptEl);

        if (typeof window.getPlaylist !== 'function') {
            throw new Error('Fungsi window.getPlaylist tidak ditemukan di app.js');
        }

        // 8. Eksekusi dekripsi
        console.log(`⚙️ Menjalankan window.getPlaylist('${id}')...`);
        const result = await window.getPlaylist(id);

        console.log(`\n✅ --- [DECODED RESULT BY APP.JS] ---`);
        console.log(JSON.stringify(result, null, 2));
        console.log(`=======================================================\n`);

        return res.json({
            status: true,
            id: id,
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
