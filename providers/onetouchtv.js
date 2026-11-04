const { createDecipheriv } = require('crypto');
const { getDetails, resolveImdbId } = require('../utils/tmdb');
const { getEpisodesPerSeason } = require('../utils/cinemetaEpisodes');
const { findBestMatch } = require('../utils/titleMatch');
const { tmdbTitleToImdbId } = require('../utils/tmdbTitleToImdb');

const MAIN_URL = 'https://api3.devcorp.me';
const AES_KEY = Buffer.from('im72charPasswordofdInitVectorStm', 'utf8');
const AES_IV = Buffer.from('im72charPassword', 'utf8');
const FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://onetouchtv.xyz/'
};
const FETCH_TIMEOUT_MS = 15000;
const FETCH_RETRIES = 2;
const FETCH_RETRY_DELAY_MS = 400;
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function fromCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function toCache(key, data) {
    cache.set(key, { data, ts: Date.now() });
}

function decrypt(encoded) {
    let s = encoded
        .replace(/-_\./g, '/')
        .replace(/@/g, '+')
        .replace(/\s+/g, '');
    const pad = s.length % 4;
    if (pad !== 0) s += '='.repeat(4 - pad);

    const buf = Buffer.from(s, 'base64');
    const decipher = createDecipheriv('aes-256-cbc', AES_KEY, AES_IV);
    const dec = Buffer.concat([decipher.update(buf), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
}

async function fetchEncryptedOnce(url) {
    const res = await fetch(url, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const text = await res.text();
    const parsed = decrypt(text);
    return parsed.result;
}

async function fetchEncrypted(path, cacheTtlMs = CACHE_TTL_MS) {
    const url = path.startsWith('https://') ? path : `${MAIN_URL}${path}`;

    if (cacheTtlMs > 0) {
        const cached = fromCache(url);
        if (cached !== null) return cached;
    }

    let lastErr;
    for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
        try {
            const data = await fetchEncryptedOnce(url);
            if (cacheTtlMs > 0) toCache(url, data);
            return data;
        } catch (err) {
            lastErr = err;
            if (attempt < FETCH_RETRIES) {
                console.warn(`[OneTouchTV] fetch failed (attempt ${attempt + 1}): ${err.message}`);
                await sleep(FETCH_RETRY_DELAY_MS * (attempt + 1));
            }
        }
    }
    throw lastErr;
}

const TYPE_MAP = {
    movie: new Set(['movie']),
    series: new Set(['drama', 'variety', 'anime'])
};

function isTypeCompatible(stremioType, onetouchType) {
    const allowed = TYPE_MAP[stremioType];
    if (!allowed) return true;
    return allowed.has(onetouchType.toLowerCase());
}

function findBestOttMatch(results, title, year, stremioType, targetSeason) {
    if (results.length === 0) return null;

    const filtered = results.filter((r) => isTypeCompatible(stremioType, r.type));

    if (filtered.length === 0) return null;

    const candidates = filtered.map((r) => ({
        title: r.title,
        year: parseInt(r.year, 10) || undefined,
        type: stremioType,
        season: targetSeason ?? undefined,
        raw: r
    }));

    const { best } = findBestMatch(
        {
            title,
            year: year ?? undefined,
            type: stremioType,
            season: targetSeason ?? undefined
        },
        candidates,
        { provider: 'OneTouchTV' }
    );

    return best ? best.raw : null;
}

async function searchContent(keyword) {
    const path = `/vod/search?keyword=${encodeURIComponent(keyword)}`;
    try {
        const results = await fetchEncrypted(path);
        return Array.isArray(results) ? results : [];
    } catch (err) {
        console.error(`[OneTouchTV] search failed for "${keyword}": ${err.message}`);
        return [];
    }
}

async function getDetail(id) {
    try {
        const result = await fetchEncrypted(`/vod/${id}/detail`);
        return result ?? null;
    } catch (err) {
        console.error(`[OneTouchTV] detail failed for ${id}: ${err.message}`);
        return null;
    }
}

async function getEpisodeStreams(id, playId) {
    try {
        const result = await fetchEncrypted(`/vod/${id}/episode/${playId}`, 0);
        return result ?? null;
    } catch (err) {
        console.error(`[OneTouchTV] episode fetch failed ${id}/${playId}: ${err.message}`);
        return null;
    }
}

function resolveQuality(quality) {
    if (!quality) return 'Unknown';
    const q = quality.toLowerCase();
    if (q === 'auto') return 'Auto';
    if (q.includes('1080')) return '1080p';
    if (q.includes('720')) return '720p';
    if (q.includes('480')) return '480p';
    if (q.includes('360')) return '360p';
    return quality;
}

async function resolveAbsoluteEpisode(imdbId, season, episode) {
    if (season <= 1) return episode;

    const episodesPerSeason = await getEpisodesPerSeason(imdbId);
    if (episodesPerSeason.length < season - 1) return null;

    let offset = 0;
    for (let s = 0; s < season - 1; s++) {
        const count = episodesPerSeason[s] ?? 0;
        if (count === 0) return null;
        offset += count;
    }
    return offset + episode;
}

async function getOnetouchtvStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[OneTouchTV] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);

    try {
        const type = mediaType === 'tv' ? 'series' : 'movie';
        const tmdbType = mediaType === 'tv' ? 'tv' : 'movie';
        const details = await getDetails(tmdbType, tmdbId);
        const title = (details && (details.title || details.name)) || '';
        const year = (details && (details.release_date || details.first_air_date || '').slice(0, 4)) || null;
        if (!title) {
            console.log(`[OneTouchTV] No TMDB title resolved for ${tmdbId}`);
            return [];
        }
        const imdbId = await resolveImdbId(tmdbType, tmdbId);

        const season = seasonNum || 1;
        const episode = episodeNum || 1;

        const searchKeywords = [title];
        if (type === 'series' && season > 1) {
            searchKeywords.unshift(`${title} Season ${season}`);
        }

        let matchResult = null;
        for (const keyword of searchKeywords) {
            const results = await searchContent(keyword);
            const searchYear = keyword !== title && season > 1 ? null : year;
            const match = findBestOttMatch(results, keyword, searchYear, type, season);
            if (match) {
                matchResult = match;
                break;
            }
        }

        if (!matchResult) {
            console.log(`[OneTouchTV] "${title}" not found`);
            return [];
        }

        if (imdbId && imdbId.startsWith('tt')) {
            const matchedYear = matchResult.year ? parseInt(matchResult.year, 10) : undefined;
            const resolvedId = await tmdbTitleToImdbId(
                matchResult.title,
                Number.isFinite(matchedYear) ? matchedYear : undefined,
                type
            ).catch(() => null);
            if (resolvedId && resolvedId !== imdbId) {
                console.log(`[OneTouchTV] IMDB ID mismatch — rejecting match: expected ${imdbId}, resolved ${resolvedId}`);
                return [];
            }
        }

        const detail = await getDetail(matchResult.id);
        if (!detail || !detail.episodes || detail.episodes.length === 0) {
            console.log(`[OneTouchTV] no episodes in detail for "${matchResult.title}"`);
            return [];
        }

        let targetEpisode = null;

        if (type === 'movie') {
            targetEpisode = detail.episodes[0] ?? null;
        } else {
            const targetSeasonInTitle = new RegExp(`\\bseason\\s+${season}\\b`, 'i');
            const anySeasonInTitle = /\bseason\s+(\d+)\b/i;
            const matchedSeasonNum = anySeasonInTitle.exec(matchResult.title);
            const entryIsForTargetSeason =
                season === 1 || targetSeasonInTitle.test(matchResult.title);

            if (
                season > 1 &&
                matchedSeasonNum !== null &&
                parseInt(matchedSeasonNum[1], 10) !== season
            ) {
                console.warn(`[OneTouchTV] matched title names a different season — aborting`);
                return [];
            }

            if (entryIsForTargetSeason) {
                targetEpisode = detail.episodes.find((e) => parseInt(e.episode, 10) === episode) ?? null;
            } else {
                let absEp = null;
                if (imdbId) {
                    absEp = await resolveAbsoluteEpisode(imdbId, season, episode);
                }

                if (absEp !== null) {
                    targetEpisode = detail.episodes.find((e) => parseInt(e.episode, 10) === absEp) ?? null;
                }

                if (!targetEpisode && season === 1) {
                    targetEpisode = detail.episodes.find((e) => parseInt(e.episode, 10) === episode) ?? null;
                }
            }
        }

        if (!targetEpisode) {
            console.log(`[OneTouchTV] episode not found (S${season}E${episode})`);
            return [];
        }

        const streamData = await getEpisodeStreams(matchResult.id, targetEpisode.playId);
        if (!streamData) return [];

        const sources = streamData.sources ?? [];
        if (sources.length === 0) {
            console.log(`[OneTouchTV] no sources in episode for "${matchResult.title}"`);
            return [];
        }

        const subtitles = [];
        for (const track of streamData.track ?? []) {
            if (track.file && track.name) {
                subtitles.push({ url: track.file, lang: track.name });
            }
        }

        const out = [];
        for (const src of sources) {
            if (!src.url) continue;
            const quality = resolveQuality(src.quality);
            const sourceName = src.name ? ` | ${src.name}` : '';
            out.push({
                name: `OneTouchTV${sourceName}`,
                title: `${matchResult.title}\n${quality} · ${(src.type ?? 'HLS').toUpperCase()}`,
                url: src.url,
                quality,
                provider: 'OneTouchTV',
                // CDN ko site ka Referer/Origin + real UA chahiye (pehle api3.devcorp.me tha -> HTTP 403)
                headers: {
                    'User-Agent': FETCH_HEADERS['User-Agent'],
                    'Referer': 'https://onetouchtv.xyz/',
                    'Origin': 'https://onetouchtv.xyz'
                },
                ...(subtitles.length ? { subtitles } : {})
            });
        }

        const seen = new Set();
        const streams = out.filter((s) => {
            if (seen.has(s.url)) return false;
            seen.add(s.url);
            return true;
        });
        console.log(`[OneTouchTV] Got ${streams.length} stream(s) for "${matchResult.title}"`);
        return streams;
    } catch (err) {
        console.error(`[OneTouchTV] Error: ${err.message}`);
        return [];
    }
}

module.exports = { getOnetouchtvStreams };
