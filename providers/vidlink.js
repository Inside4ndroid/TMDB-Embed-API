const axios = require('axios');

const VIDLINK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Referer': 'https://vidlink.pro'
};

function qualityToNumber(quality) {
    if (quality === '4k') return 2160;
    if (quality === 'Auto' || quality === 'unknown') return 0;
    const parsed = parseInt(quality, 10);
    return isNaN(parsed) ? 0 : parsed;
}

function qualityLabel(quality) {
    if (quality === '4k') return '4K';
    if (quality === 'Auto' || quality === 'unknown') return 'Auto';
    return `${quality}p`;
}

async function getVidlinkStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[Vidlink] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);

    try {
        const encRes = await axios.get(
            `https://enc-dec.app/api/enc-vidlink?text=${encodeURIComponent(String(tmdbId))}`,
            { timeout: 8000 }
        );
        const encodedTmdb = encRes.data && encRes.data.result;
        if (!encodedTmdb) {
            console.log('[Vidlink] Encryption step returned no result.');
            return [];
        }

        const apiUrl = mediaType === 'tv'
            ? `https://vidlink.pro/api/b/tv/${encodedTmdb}/${seasonNum}/${episodeNum}?multiLang=0`
            : `https://vidlink.pro/api/b/movie/${encodedTmdb}?multiLang=0`;

        const apiRes = await axios.get(apiUrl, { headers: VIDLINK_HEADERS, timeout: 8000 });

        const streamData = apiRes.data && apiRes.data.stream;
        if (!streamData || !streamData.qualities) {
            console.log('[Vidlink] No quality streams in response.');
            return [];
        }

        const streams = Object.entries(streamData.qualities)
            .filter(([, entry]) => entry && entry.url)
            .sort((a, b) => qualityToNumber(b[0]) - qualityToNumber(a[0]))
            .map(([qualityKey, entry]) => ({
                name: 'Vidlink',
                title: `Vidlink - ${qualityLabel(qualityKey)}`,
                url: entry.url,
                quality: qualityKey,
                provider: 'Vidlink',
                headers: { 'Referer': 'https://vidlink.pro' }
            }));

        if (streams.length === 0) {
            console.log('[Vidlink] No usable stream URLs in response.');
            return [];
        }

        console.log(`[Vidlink] Got ${streams.length} stream(s).`);
        return streams;
    } catch (err) {
        console.error(`[Vidlink] Error: ${err.message}`);
        return [];
    }
}

module.exports = { getVidlinkStreams };
