const express = require('express');
const cors = require('cors');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const app = express();
const PORT = process.env.PORT || 8000;

// Domain target terbaru
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

        // 1. Inisialisasi Virtual DOM dengan domain pulvexa.space
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

        // 4. INTERCEPTOR FETCH: Tempelkan domain pulvexa.space + Header Browser
        window.fetch = async function(resource, config = {}) {
            let finalUrl = resource;

            if (typeof resource === 'string') {
                if (resource.startsWith('/')) {
                    finalUrl = TARGET_HOST + resource;
                } else if (!resource.startsWith('http')) {
                    finalUrl = TARGET_HOST + '/' + resource;
                }
            } else if (resource && resource.href) {
                if (resource.href.startsWith('about:blank') || !resource.href.startsWith('http')) {
                    finalUrl = TARGET_HOST + resource.pathname + resource.search;
                }
            }

            // Custom Headers agar tidak ditolak server pulvexa.space
            const mergedHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'Referer': TARGET_HOST + '/',
                'Origin': TARGET_HOST,
                ...(config.headers || {})
            };

            return globalThis.fetch(finalUrl, {
                ...config,
                headers: mergedHeaders
            });
        };

        // 5. Inject script app.js ke Virtual DOM
        const scriptEl = window.document.createElement('script');
        scriptEl.textContent = appJsContent;
        window.document.body.appendChild(scriptEl);

        if (typeof window.getPlaylist !== 'function') {
            throw new Error('Fungsi window.getPlaylist tidak ditemukan di app.js');
        }

        // 6. Eksekusi fungsi getPlaylist
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
