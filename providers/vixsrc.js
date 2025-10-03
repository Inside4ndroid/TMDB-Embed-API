/**
 * Vixsrc streaming provider integration (standalone)
 * React Native compatible variant - no external addon framework
 */

// Constants
const TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
const BASE_URL = 'https://vixsrc.to';
let vixsrcUrl;
let subtitleApiUrl;
// Helper function to make HTTP requests with default headers
function makeRequest(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json,*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        ...options.headers
    };

    return fetch(url, {
        method: options.method || 'GET',
        headers: defaultHeaders,
        ...options
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response;
        })
        .catch(error => {
            console.error(`[Vixsrc] Request failed for ${url}: ${error.message}`);
            throw error;
        });
}

// Helper function to get TMDB info
function getTmdbInfo(tmdbId, mediaType) {
    const url = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    return makeRequest(url)
        .then(response => response.json())
        .then(data => ({ data }));
}

// Helper function to parse M3U8 playlist
// Removed obsolete parseM3U8Playlist implementation

// Removed unused helpers getQualityFromResolution and resolveUrl

// Helper function to extract stream URL from Vixsrc page
function extractStreamFromPage(url, contentType, contentId, seasonNum, episodeNum) {

    if (contentType === 'movie') {
        vixsrcUrl = `${BASE_URL}/movie/${contentId}`;
        subtitleApiUrl = `https://sub.wyzie.ru/search?id=${contentId}`;
    } else {
        vixsrcUrl = `${BASE_URL}/tv/${contentId}/${seasonNum}/${episodeNum}`;
        subtitleApiUrl = `https://sub.wyzie.ru/search?id=${contentId}&season=${seasonNum}&episode=${episodeNum}`;
    }

    console.log(`[Vixsrc] Fetching: ${vixsrcUrl}`);

    return makeRequest(vixsrcUrl, {
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
    })
        .then(response => response.text())
        .then(html => {
            console.log(`[Vixsrc] HTML length: ${html.length} characters`);

            let masterPlaylistUrl = null;

            // Method 1: Look for window.masterPlaylist (primary method)
            if (html.includes('window.masterPlaylist')) {
                console.log('[Vixsrc] Found window.masterPlaylist');

                const urlMatch = html.match(/url:\s*['"]([^'"]+)['"]/);
                const tokenMatch = html.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
                const expiresMatch = html.match(/['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/);

                if (urlMatch && tokenMatch && expiresMatch) {
                    const baseUrl = urlMatch[1];
                    const token = tokenMatch[1];
                    const expires = expiresMatch[1];

                    console.log('[Vixsrc] Extracted tokens:');
                    console.log(`  - Base URL: ${baseUrl}`);
                    console.log(`  - Token: ${token.substring(0, 20)}...`);
                    console.log(`  - Expires: ${expires}`);

                    // Construct the master playlist URL
                    if (baseUrl.includes('?b=1')) {
                        masterPlaylistUrl = `${baseUrl}&token=${token}&expires=${expires}&h=1&lang=en`;
                    } else {
                        masterPlaylistUrl = `${baseUrl}?token=${token}&expires=${expires}&h=1&lang=en`;
                    }

                    console.log(`[Vixsrc] Constructed master playlist URL: ${masterPlaylistUrl}`);
                }
            }

            // Method 2: Look for direct .m3u8 URLs
            if (!masterPlaylistUrl) {
                const m3u8Match = html.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
                if (m3u8Match) {
                    masterPlaylistUrl = m3u8Match[1];
                    console.log('[Vixsrc] Found direct .m3u8 URL:', masterPlaylistUrl);
                }
            }

            // Method 3: Look for stream URLs in script tags
            if (!masterPlaylistUrl) {
                const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gs);
                if (scriptMatches) {
                    for (const script of scriptMatches) {
                        const streamMatch = script.match(/['"]?(https?:\/\/[^'"\s]+(?:\.m3u8|playlist)[^'"\s]*)/);
                        if (streamMatch) {
                            masterPlaylistUrl = streamMatch[1];
                            console.log('[Vixsrc] Found stream in script:', masterPlaylistUrl);
                            break;
                        }
                    }
                }
            }

            if (!masterPlaylistUrl) {
                console.log('[Vixsrc] No master playlist URL found');
                return null;
            }

            return { masterPlaylistUrl, subtitleApiUrl };
        });
}

// Helper function to get subtitles
function getSubtitles(subtitleApiUrl) {
    return makeRequest(subtitleApiUrl)
        .then(response => response.json())
        .then(subtitleData => {
            // Find English subtitle track (same logic as original)
            let subtitleTrack = subtitleData.find(track =>
                track.display.includes('English') && (track.encoding === 'ASCII' || track.encoding === 'UTF-8')
            );

            if (!subtitleTrack) {
                subtitleTrack = subtitleData.find(track => track.display.includes('English') && track.encoding === 'CP1252');
            }

            if (!subtitleTrack) {
                subtitleTrack = subtitleData.find(track => track.display.includes('English') && track.encoding === 'CP1250');
            }

            if (!subtitleTrack) {
                subtitleTrack = subtitleData.find(track => track.display.includes('English') && track.encoding === 'CP850');
            }

            const subtitles = subtitleTrack ? subtitleTrack.url : '';
            console.log(subtitles ? `[Vixsrc] Found subtitles: ${subtitles}` : '[Vixsrc] No English subtitles found');
            return subtitles;
        })
        .catch(error => {
            console.log('[Vixsrc] Subtitle fetch failed:', error.message);
            return '';
        });
}

// Main function to get streams
function getVixsrcStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[Vixsrc] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);

    return getTmdbInfo(tmdbId, mediaType)
        .then(() => extractStreamFromPage(null, mediaType, tmdbId, seasonNum, episodeNum))
        .then(streamData => {
            if (!streamData) {
                console.log('[Vixsrc] No stream data found');
                return [];
            }

            const { masterPlaylistUrl, subtitleApiUrl } = streamData;

            // Return single master playlist with Auto quality
            console.log('[Vixsrc] Returning master playlist with Auto quality...');

            // Get subtitles
            return getSubtitles(subtitleApiUrl)
                .then(subtitles => {
                    // Return single stream with master playlist
                    const tmdbStreams = [{
                        name: "Vixsrc",
                        title: "Auto Quality Stream",
                        url: masterPlaylistUrl,
                        quality: '1080p',
                        provider: 'Vidsrc',
                        headers: {
                            'Referer': vixsrcUrl,
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                        }
                    }];

                    console.log('[Vixsrc] Successfully processed 1 stream with Auto quality');
                    return tmdbStreams;
                });
        })
        .catch(error => {
            console.error(`[Vixsrc] Error in getVixsrcStreams: ${error.message}`);
            return [];
        });
}

module.exports = { getVixsrcStreams };
