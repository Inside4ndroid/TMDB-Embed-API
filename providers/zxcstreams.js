const { createHash } = require('crypto');
const { getDetails, resolveImdbId } = require('../utils/tmdb');

const PORTALS = ['https://zxcstream.xyz', 'https://zxcprime.xyz'];
const INITIAL_BASE = 'https://r1.zxcstream.xyz';
const SALT = '3435443433';
const SERVERS = ['icarus', 'berkas', 'orion', 'athena'];
const BASE_TTL = 10 * 60 * 1000;
const PROBE_SUBDOMAINS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'v4', 'cdn', 'api', 'stream'];

const F = {
    id: 'rgrwsdsdfgwrwrwwr',
    fToken: 'xfgdfgdsffgrwgrwyjhkjt',
    ts: 'rdghhdghhfssft',
    token: 'ZDDVHJFGHYRHG',
    title: 'TUKTHFSSFGDGHJS',
    year: '53653TRFG647GF',
    season: 'adkljfhdahfladhfjahfjlahfhfljkadfdf',
    episode: '546745ygy46ytfgty',
    imdbId: '564745ygtuy5yi75yuy'
};

const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
};

let _base = INITIAL_BASE;
let _baseValidatedAt = 0;
let discoveryPromise = null;

function sha512Hex(data) {
    return createHash('sha512').update(data).digest('hex');
}

async function verifyBase(base) {
    const rt = Date.now();
    const xt = sha512Hex(`${rt}:${SALT}:550`).slice(0, 64);
    const r = await fetch(`${base}/backend/token`, {
        method: 'POST',
        headers: {
            ...COMMON_HEADERS,
            Origin: base,
            'Content-Type': 'application/json',
            Referer: `${base}/player/movie/550`
        },
        body: JSON.stringify({ [F.id]: '550', [F.fToken]: xt, [F.ts]: rt }),
        signal: AbortSignal.timeout(6000)
    });
    if (r.ok) {
        const d = await r.json();
        if (d[F.token]) return base;
    }
    throw new Error(`verify failed: ${r.status}`);
}

async function tryPortal(portal) {
    const r = await fetch(portal, {
        headers: { 'User-Agent': COMMON_HEADERS['User-Agent'] },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000)
    });
    const redirectedBase = new URL(r.url).origin;
    if (redirectedBase === new URL(portal).origin) {
        throw new Error(`portal ${portal} did not redirect`);
    }
    return await verifyBase(redirectedBase);
}

async function probeSubdomain(sub) {
    return verifyBase(`https://${sub}.zxcstream.xyz`);
}

async function discoverBase() {
    const portalResults = await Promise.allSettled(PORTALS.map((portal) => tryPortal(portal)));
    for (const r of portalResults) {
        if (r.status === 'fulfilled') {
            console.log(`[ZXCStreams] discovered base via portal redirect: ${r.value}`);
            return r.value;
        }
    }

    console.warn('[ZXCStreams] both portals failed, falling back to subdomain probing');
    const settled = await Promise.allSettled(PROBE_SUBDOMAINS.map((sub) => probeSubdomain(sub)));
    for (const r of settled) {
        if (r.status === 'fulfilled') {
            console.log(`[ZXCStreams] discovered base via subdomain probe: ${r.value}`);
            return r.value;
        }
    }

    console.warn('[ZXCStreams] all discovery methods failed, keeping last known base:', _base);
    return _base;
}

async function getBase() {
    if (Date.now() - _baseValidatedAt <= BASE_TTL) {
        return _base;
    }
    if (!discoveryPromise) {
        discoveryPromise = discoverBase()
            .then((base) => {
                _base = base;
                _baseValidatedAt = Date.now();
                return base;
            })
            .finally(() => {
                discoveryPromise = null;
            });
    }
    return discoveryPromise;
}

function invalidateBase() {
    _baseValidatedAt = 0;
}

function generateFrontendToken(tmdbId) {
    const rt = Date.now();
    const xt = sha512Hex(`${rt}:${SALT}:${tmdbId}`).slice(0, 64);
    return { xt, rt };
}

async function requestServerToken(base, tmdbId, referer) {
    const { xt, rt } = generateFrontendToken(tmdbId);
    const body = JSON.stringify({
        [F.id]: tmdbId,
        [F.fToken]: xt,
        [F.ts]: rt
    });
    const res = await fetch(`${base}/backend/token`, {
        method: 'POST',
        headers: {
            ...COMMON_HEADERS,
            Origin: base,
            'Content-Type': 'application/json',
            Referer: referer
        },
        body
    });
    if (!res.ok) throw new Error(`token failed ${res.status}`);
    const data = await res.json();
    return { serverToken: data[F.token], serverTs: data[F.ts], xt };
}

async function fetchServer(server, meta, type, season, episode) {
    let base = await getBase();

    const buildReferer = (b) =>
        `${b}/player/${type}/${meta.tmdbId}${season != null ? `/${season}/${episode}` : ''}`;

    let referer = buildReferer(base);
    let tokenData;

    try {
        tokenData = await requestServerToken(base, meta.tmdbId, referer);
    } catch (err) {
        console.warn(`[ZXCStreams] token request failed on ${base}, re-discovering...`, err.message);
        invalidateBase();
        base = await getBase();
        referer = buildReferer(base);
        tokenData = await requestServerToken(base, meta.tmdbId, referer);
    }

    const { serverToken, serverTs, xt } = tokenData;

    const params = {
        [F.id]: meta.tmdbId,
        b: type,
        [F.ts]: String(serverTs),
        [F.token]: serverToken,
        [F.fToken]: xt,
        [F.title]: meta.title,
        [F.year]: meta.year,
        date: meta.releaseDate,
        [F.imdbId]: meta.imdbId
    };
    if (season != null && episode != null) {
        params[F.season] = String(season);
        params[F.episode] = String(episode);
    }
    const qs = new URLSearchParams(params).toString();

    const res = await fetch(`${base}/backend_/servers/${server}?${qs}`, {
        headers: { ...COMMON_HEADERS, Origin: base, Referer: referer }
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.success || !Array.isArray(data.links)) return [];

    const requestHeaders = {
        Referer: referer,
        Origin: base,
        'User-Agent': COMMON_HEADERS['User-Agent']
    };

    return data.links
        .filter((l) => l.link)
        .map((l) => ({
            server,
            type: l.type || (l.link.includes('.m3u8') ? 'hls' : 'mp4'),
            resolution: l.resolution ?? (l.source && l.source !== 'default' ? l.source : undefined) ?? '?',
            size: l.size,
            url: l.link,
            requestHeaders
        }));
}

async function getAllStreams(type, meta, season, episode) {
    const results = await Promise.allSettled(
        SERVERS.map((s) => fetchServer(s, meta, type, season, episode))
    );
    const streams = [];
    for (const r of results) {
        if (r.status === 'fulfilled') streams.push(...r.value);
    }
    return streams;
}

function resolutionLabel(server, res) {
    if (typeof res === 'number' && res <= 4) {
        return ['360p', '480p', '720p', '1080p', '4K'][res] ?? `q${res}`;
    }
    return typeof res === 'number' ? `${res}p` : String(res);
}

function formatSize(bytes) {
    if (!bytes) return '';
    const n = Number(bytes);
    if (!Number.isFinite(n)) return '';
    if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`;
    if (n > 1e6) return `${(n / 1e6).toFixed(0)} MB`;
    return `${(n / 1e3).toFixed(0)} KB`;
}

async function getZxcstreamsStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[ZXCStreams] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);

    try {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const tmdbType = mediaType === 'tv' ? 'tv' : 'movie';
        const details = await getDetails(tmdbType, tmdbId);
        const title = (details && (details.title || details.name)) || '';
        if (!title) {
            console.log(`[ZXCStreams] No TMDB title resolved for ${tmdbId}`);
            return [];
        }
        const releaseDate = (details && (details.release_date || details.first_air_date || '').slice(0, 10)) || '';
        const year = (details && (details.release_date || details.first_air_date || '').slice(0, 4)) || '';
        const imdbId = await resolveImdbId(tmdbType, tmdbId);
        if (!imdbId || !imdbId.startsWith('tt')) {
            console.log(`[ZXCStreams] No IMDB ID resolved for TMDB ${tmdbId}`);
            return [];
        }

        const meta = {
            tmdbId: String(tmdbId),
            title,
            year,
            releaseDate,
            imdbId
        };

        const links = await getAllStreams(type, meta, seasonNum, episodeNum);
        if (!links.length) {
            console.log(`[ZXCStreams] No streams found for "${title}"`);
            return [];
        }

        const scored = links.map((l) => {
            const r = typeof l.resolution === 'number' ? l.resolution : 0;
            const height = r > 4 ? r : ([240, 480, 720, 1080, 2160][r] ?? 0);
            return { l, score: (l.type === 'mp4' ? 10000 : 0) + height };
        });
        scored.sort((a, b) => b.score - a.score);

        const streams = [];
        for (const { l } of scored) {
            const label = resolutionLabel(l.server, l.resolution);
            const size = formatSize(l.size);
            const kind = l.type === 'hls' ? 'HLS' : 'MP4';
            const serverName =
                l.server === 'icarus' ? 'Icarus' :
                l.server === 'orion' ? 'Orion' :
                l.server === 'athena' ? 'Athena' : 'Berkas';
            const titleLine = [`${serverName} • ${label} • ${kind}`, size].filter(Boolean).join('\n');
            streams.push({
                name: `ZXCStreams ${serverName} ${label}`,
                title: titleLine,
                url: l.url,
                type: l.type === 'hls' ? 'hls' : 'mp4',
                quality: label,
                provider: 'ZXCStreams',
                headers: {
                    'Referer': l.requestHeaders.Referer,
                    'Origin': l.requestHeaders.Origin,
                    'User-Agent': l.requestHeaders['User-Agent']
                }
            });
        }

        console.log(`[ZXCStreams] Got ${streams.length} stream(s) for "${title}"`);
        return streams;
    } catch (err) {
        console.error(`[ZXCStreams] Error: ${err.message}`);
        return [];
    }
}

module.exports = { getZxcstreamsStreams };
