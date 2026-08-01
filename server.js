const express = require('express');
const cors = require('cors');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const app = express();
const PORT = process.env.PORT || 8000;

// Domain target
const TARGET_HOST = 'https://pulvexa.space';

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

        // 2. Inject Web Crypto API
        Object.defineProperty(window, 'crypto', {
            value: crypto.webcrypto || globalThis.crypto,
            configurable: true,
            writable: true
        });

        // 3. Inject Polyfills
        window.Headers = globalThis.Headers;
        window.Request = globalThis.Request;
        window.Response = globalThis.Response;
        window.TextEncoder = globalThis.TextEncoder;
        window.TextDecoder = globalThis.TextDecoder;
        window.URL = globalThis.URL;
        window.URLSearchParams = globalThis.URLSearchParams;
        window.Uint8Array = globalThis.Uint8Array;
        window.ArrayBuffer = globalThis.ArrayBuffer;

        // 4. INTERCEPTOR FETCH: Lengkapi dengan Header AJAX & Logging Response
        window.fetch = async function(resource, config = {}) {
            let urlStr = typeof resource === 'string' ? resource : (resource.url || resource.href || String(resource));

            // Konversi URL relatif ke absolute
            if (!urlStr.startsWith('http')) {
                if (!urlStr.startsWith('/')) {
                    urlStr = '/' + urlStr;
                }
                urlStr = TARGET_HOST + urlStr;
            }

            console.log(`[Fetch Outgoing]: ${urlStr}`);

            // Header wajib agar tidak ditolak server AJAX pulvexa.space
            const mergedHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'X-Requested-With': 'XMLHttpRequest', // 👈 PENTING: Menandai request sebagai AJAX
                'Referer': TARGET_HOST + '/',
                'Origin': TARGET_HOST,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                ...(config.headers || {})
            };

            const response = await globalThis.fetch(urlStr, {
                ...config,
                headers: mergedHeaders
            });

            console.log(`[Fetch Status]: ${response.status} ${response.statusText}`);

            // Jika response error, cetak cuplikan isi response di log Koyeb
            if (!response.ok) {
                const clone = response.clone();
                const errText = await clone.text();
                console.error(`[Fetch Error Detail]:`, errText.substring(0, 300));
            }

            return response;
        };

        // 5. Inject script app.js ke Virtual DOM
        const scriptEl = window.document.createElement('script');
        scriptEl.textContent = appJsContent;
        window.document.body.appendChild(scriptEl);

        if (typeof window.getPlaylist !== 'function') {
            throw new Error('Fungsi window.getPlaylist tidak ditemukan di app.js');
        }

        // 6. Eksekusi dekripsi
        const result = await window.getPlaylist(id);

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
