const express = require('express');
const cors = require('cors');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const app = express();

// Koyeb akan otomatis mengisi process.env.PORT
const PORT = process.env.PORT || 8000;

// Middleware CORS
app.use(cors());

// Route Utama API
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
        // 1. Cek keberadaan file app.js
        const appJsPath = path.join(__dirname, 'app.js');
        if (!fs.existsSync(appJsPath)) {
            throw new Error('File app.js tidak ditemukan di direktori root server.');
        }
        const appJsContent = fs.readFileSync(appJsPath, 'utf8');

        // 2. Inisialisasi Virtual DOM dengan origin dremoxa.site
        dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
            runScripts: 'dangerously',
            url: 'https://dremoxa.site'
        });

        const { window } = dom;

        // Ensure Web Crypto API tersedia di Virtual Window
        if (!window.crypto || !window.crypto.subtle) {
            window.crypto = globalThis.crypto;
        }

        // Inject script app.js ke Virtual DOM
        const scriptEl = window.document.createElement('script');
        scriptEl.textContent = appJsContent;
        window.document.body.appendChild(scriptEl);

        // 3. Pastikan fungsi getPlaylist dari app.js tersedia
        if (typeof window.getPlaylist !== 'function') {
            throw new Error('Fungsi window.getPlaylist tidak ditemukan pada app.js.');
        }

        // 4. Eksekusi dekripsi getPlaylist(id)
        const result = await window.getPlaylist(id);

        // 5. Kirimkan hasil JSON ke client
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
        // Pembersihan memori agar tidak terjadi memory leak di Koyeb Free Tier
        if (dom && dom.window) {
            dom.window.close();
        }
    }
});

// Endpoint Cek Health Server
app.get('/', (req, res) => {
    res.json({ status: true, message: 'Server API Playlist Aktif!' });
});

// Binding ke 0.0.0.0 wajib untuk Koyeb / Docker Container
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Server berjalan pada port ${PORT}`);
});
