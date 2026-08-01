const express = require('express');
const cors = require('cors');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto'); // 👈 Tambahkan require crypto bawaan Node.js

const app = express();
const PORT = process.env.PORT || 8000;

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
            url: 'https://dremoxa.site'
        });

        const { window } = dom;

        // 2. PASTI-KAN Web Crypto API (termasuk .subtle.digest) terpasang sempurna
        Object.defineProperty(window, 'crypto', {
            value: crypto.webcrypto || globalThis.crypto,
            configurable: true,
            writable: true
        });

        // 3. Pasang juga fetch bawaan Node ke dalam window JSDOM
        window.fetch = globalThis.fetch;

        // 4. Inject script app.js ke Virtual DOM
        const scriptEl = window.document.createElement('script');
        scriptEl.textContent = appJsContent;
        window.document.body.appendChild(scriptEl);

        if (typeof window.getPlaylist !== 'function') {
            throw new Error('Fungsi window.getPlaylist tidak ditemukan di app.js');
        }

        // 5. Eksekusi dekripsi
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
