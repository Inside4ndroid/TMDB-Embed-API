// xprime.js (simplified & cleaned)
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const RETRY_DELAY_MS_XPRIME = 1000;
const MAX_RETRIES_XPRIME = 3;

// Cache directory (Vercel ephemeral vs local)
const CACHE_DIR = process.env.VERCEL ? path.join('/tmp', '.cache') : path.join(__dirname, '.cache');

async function ensureCacheDir(dirPath) {
    try { await fs.mkdir(dirPath, { recursive: true }); } catch (_) {
        // swallow errors creating cache dir (ephemeral env or permission)
    }
}

async function getFromCache(cacheKey, subDir = '') {
    if (process.env.DISABLE_CACHE === 'true') return null;
    try {
        const fullDir = path.join(CACHE_DIR, subDir);
        const filePath = path.join(fullDir, cacheKey);
        const data = await fs.readFile(filePath, 'utf8');
        return data;
    } catch (_) { return null; }
}

async function saveToCache(cacheKey, data, subDir = '') {
    if (process.env.DISABLE_CACHE === 'true') return;
    try {
        const fullDir = path.join(CACHE_DIR, subDir);
        await fs.mkdir(fullDir, { recursive: true });
        const filePath = path.join(fullDir, cacheKey);
        await fs.writeFile(filePath, data, 'utf8');
    } catch (_) {
        // ignore cache write errors (non-fatal)
    }
}

const BROWSER_HEADERS_XPRIME = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Connection': 'keep-alive'
};

async function fetchWithRetry(url, options, maxRetries = MAX_RETRIES_XPRIME) {
    const { default: fetch } = await import('node-fetch');
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS_XPRIME * Math.pow(2, attempt - 1)));
            }
        }
    }
    throw lastError;
}

async function fetchStreamSize(url) {
    const subDir = 'xprime_stream_sizes';
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const key = `${hash}.txt`;
    const cached = await getFromCache(key, subDir);
    if (cached) return cached;
    if (url.toLowerCase().includes('.m3u8')) {
        await saveToCache(key, 'Playlist (size N/A)', subDir);
        return 'Playlist (size N/A)';
    }
    try {
        const { default: fetch } = await import('node-fetch');
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        let size = 'Unknown size';
        try {
            const head = await fetch(url, { method: 'HEAD', signal: controller.signal });
            const cl = head.headers.get('content-length');
            if (cl) {
                const bytes = parseInt(cl, 10);
                if (!isNaN(bytes)) {
                    if (bytes < 1024) size = `${bytes} B`;
                    else if (bytes < 1024 * 1024) size = `${(bytes / 1024).toFixed(2)} KB`;
                    else if (bytes < 1024 * 1024 * 1024) size = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
                    else size = `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                }
            }
        } finally { clearTimeout(t); }
        await saveToCache(key, size, subDir);
        return size;
    } catch (_) {
        await saveToCache(key, 'Unknown size', subDir);
        return 'Unknown size';
    }
}

async function getXprimeStreams(title, year, type, seasonNum, episodeNum) {
    if (!title || !year) return [];
    const encoded = encodeURIComponent(title);
    let apiUrl;
    if (type === 'movie') {
        apiUrl = `https://backend.xprime.tv/primebox?name=${encoded}&year=${year}&fallback_year=${year}`;
    } else if (type === 'tv') {
        if (seasonNum == null || episodeNum == null) return [];
        apiUrl = `https://backend.xprime.tv/primebox?name=${encoded}&year=${year}&fallback_year=${year}&season=${seasonNum}&episode=${episodeNum}`;
    } else return [];

    console.log(`[Xprime.tv] Fetch attempt '${title}' (${year}) type=${type}`);

    let resJson;
    try {
        const r = await fetchWithRetry(apiUrl, { headers: BROWSER_HEADERS_XPRIME });
        resJson = await r.json();
    } catch (e) {
        console.error('[Xprime.tv] Fetch failed:', e.message);
        return [];
    }

    const streams = [];
    const processItem = (item) => {
        if (!item || item.error || !item.streams) return;
        Object.entries(item.streams).forEach(([quality, url]) => {
            if (!url || typeof url !== 'string') return;
            streams.push({
                name: title,
                title: `${title} - ${type === 'tv' ? `S${String(seasonNum).padStart(2,'0')}E${String(episodeNum).padStart(2,'0')} ` : ''}${quality}`,
                url,
                quality: quality || 'Unknown',
                provider: 'Xprime.tv',
                headers: {},
            });
        });
    };
    if (Array.isArray(resJson)) resJson.forEach(processItem); else processItem(resJson);

    if (streams.length) {
        console.time('[Xprime.tv] Fetch stream sizes');
        await Promise.all(streams.map(async s => { s.size = await fetchStreamSize(s.url); }));
        console.timeEnd('[Xprime.tv] Fetch stream sizes');
    }

    console.log(`[Xprime.tv] Returning ${streams.length} streams.`);
    return streams;
}

ensureCacheDir(CACHE_DIR).catch(()=>{});

module.exports = { getXprimeStreams };