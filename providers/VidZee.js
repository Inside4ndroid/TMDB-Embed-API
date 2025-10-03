const axios = require('axios');

// Confirmed AES-CBC decoder for VidZee encrypted link format.
// Format (after initial atob in site script): ivBase64:cipherBase64
// ivBase64 -> CryptoJS Base64 parsed to WordArray (IV)
// Key: UTF-8 bytes of "qrincywincyspider" padded with nulls to 32 bytes (AES-256-CBC)
// Cipher: base64 ciphertext, PKCS7 padding, mode CBC.
let cryptoJs; // lazy load to avoid cost if not needed
function decodeVidZeeToken(token, debug) {
    try {
        if (typeof token !== 'string') return null;
        if (/^https?:\/\//i.test(token)) return null; // already a URL
        // Expect pattern base64:base64 (iv:cipher)
        const raw = Buffer.from(token, 'base64').toString('utf8');
        if (!raw.includes(':')) return null;
        const [ivB64, cipherB64] = raw.split(':');
        if (!ivB64 || !cipherB64) return null;
        if (!cryptoJs) cryptoJs = require('crypto-js');
        const iv = cryptoJs.enc.Base64.parse(ivB64.trim());
        const keyStr = 'qrincywincyspider';
        // Pad key with nulls to 32 bytes
        const keyUtf8 = cryptoJs.enc.Utf8.parse(keyStr.padEnd(32, '\0'));
        const decrypted = cryptoJs.AES.decrypt(cipherB64.trim(), keyUtf8, {
            iv,
            mode: cryptoJs.mode.CBC,
            padding: cryptoJs.pad.Pkcs7
        }).toString(cryptoJs.enc.Utf8);
        if (!decrypted) return null;
        if (!/^https?:\/\//i.test(decrypted)) {
            if (debug) console.log('[VidZee] decrypted but not a URL', decrypted.slice(0,80));
            return null;
        }
        if (debug) console.log('[VidZee] AES decoded token', { tokenSnippet: token.slice(0, 24)+'...', url: decrypted.slice(0,120) });
        return decrypted.trim();
    } catch (e) {
        if (debug) console.log('[VidZee] AES decode error', e.message);
        return null;
    }
}

// Removed unused parseArgs helper

const getVidZeeStreams = async (tmdbId, mediaType, seasonNum, episodeNum) => {
    if (!tmdbId) {
        console.error('[VidZee] Error: TMDB ID (tmdbId) is required.');
        return [];
    }

    if (!mediaType || (mediaType !== 'movie' && mediaType !== 'tv')) {
        console.error('[VidZee] Error: mediaType is required and must be either "movie" or "tv".');
        return [];
    }

    if (mediaType === 'tv') {
        if (!seasonNum) {
            console.error('[VidZee] Error: Season (seasonNum) is required for TV shows.');
            return [];
        }
        if (!episodeNum) {
            console.error('[VidZee] Error: Episode (episodeNum) is required for TV shows.');
            return [];
        }
    }

    const servers = [1,2,3,4,5,6,7,8,9,10]; // VidZee server identifiers

    const streamPromises = servers.map(async (sr) => {
        let targetApiUrl = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=${sr}`;

        if (mediaType === 'tv') {
            targetApiUrl += `&ss=${seasonNum}&ep=${episodeNum}`;
        }

        let finalApiUrl;
        const headers = {
            'Referer': `https://player.vidzee.wtf/embed/movie/${tmdbId}`
        };
        const timeout = 7000; // Reduced timeout

        finalApiUrl = targetApiUrl;

        console.log(`[VidZee] Fetching from server ${sr}: ${targetApiUrl}`);

        try {
            const response = await axios.get(finalApiUrl, {
                headers: headers,
                timeout: timeout
            });

            const responseData = response.data;

            if (!responseData || typeof responseData !== 'object') {
                console.error(`[VidZee S${sr}] Error: Invalid response data from API.`);
                return [];
            }
            
            if (responseData.tracks) {
                delete responseData.tracks;
            }

            let apiSources = [];
            if (responseData.url && Array.isArray(responseData.url)) {
                apiSources = responseData.url;
            } else if (responseData.link && typeof responseData.link === 'string') {
                apiSources = [responseData];
            }

            if (!apiSources || apiSources.length === 0) {
                console.log(`[VidZee S${sr}] No stream sources found in API response.`);
                return [];
            }

            const streams = apiSources.map(sourceItem => {
                const label = sourceItem.name || sourceItem.type || 'VidZee';
                let quality = String(label).match(/^\d+$/) ? `${label}p` : label;
                if (!/(\d{3,4})p/.test(quality.toLowerCase())) {
                    quality = '720p';
                }
                const language = sourceItem.language || sourceItem.lang;
                let rawLink = sourceItem.link;
                const debug = process.env.VIDZEE_DEBUG === '1';
                const decoded = decodeVidZeeToken(rawLink, debug);
                if (decoded && /^https?:\/\//i.test(decoded)) {
                    if (debug) console.log('[VidZee] decoded link', { beforeSample: rawLink.slice(0,40)+'...', after: decoded.slice(0,80) });
                    rawLink = decoded;
                }
                return {
                    name: `VidZee Server${sr} - ${quality} - ${language}`,
                    title: `VidZee Server${sr} - ${quality} - ${language}`,
                    url: rawLink,
                    quality: quality,
                    provider: "VidZee",
                    headers: { 
                        'Referer': 'https://core.vidzee.wtf/'
                    }
                };
            }).filter(stream => stream.url);

            console.log(`[VidZee S${sr}] Successfully extracted ${streams.length} streams. Qualities: ${streams.map(s=>s.quality).join(', ')}`);
            return streams;

        } catch (error) {
            if (error.response) {
                console.error(`[VidZee S${sr}] Error fetching: ${error.response.status} ${error.response.statusText}`);
            } else if (error.request) {
                console.error(`[VidZee S${sr}] Error fetching: No response received.`);
            } else {
                console.error(`[VidZee S${sr}] Error fetching:`, error.message);
            }
            return [];
        }
    });

    const allStreamsNested = await Promise.all(streamPromises);
    const allStreams = allStreamsNested.flat();

    console.log(`[VidZee] Found a total of ${allStreams.length} streams from servers ${servers.join(', ')}.`);
    return allStreams;
};

module.exports = { getVidZeeStreams }; 