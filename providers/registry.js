const { config } = require('../utils/config');
// Lazy load showbox to avoid early side-effects; temporarily disabled until stabilized
let showbox = null;
let k4hdhub = null; // 4khdhub provider lazy ref
let moviesmod = null; // moviesmod provider lazy ref
let mp4hydra = null; // MP4Hydra provider lazy ref
let vidzee = null; // VidZee provider lazy ref
let vixsrc = null; // vixsrc provider lazy ref
let xprime = null; // xprime provider lazy ref
// Stats for debug endpoint
let lastCookieStats = { selected: null, index: null, total: 0, remainingMB: null, timestamp: null };

async function getEffectiveCookies() {
  return Array.isArray(config.febboxCookies) ? config.febboxCookies : [];
}

// Adapter for Showbox provider using existing exported getStreamsFromTmdbId
async function fetchShowbox(ctx) {
  if (!showbox) {
    try { showbox = require('./Showbox.js'); } catch (e) { console.error('Failed to load Showbox provider:', e.message); return []; }
  }
  const { getTmdbApiKey } = require('../utils/tmdbKey');
  const tmdbApiKey = getTmdbApiKey();
  if (!tmdbApiKey) {
    console.warn('[registry] showbox skipped: TMDB API key missing');
    return [];
  }
  const cookies = await getEffectiveCookies();
  const previousConfig = global.currentRequestConfig;
  global.currentRequestConfig = { ...(previousConfig || {}) };
  let selected = null;
  if (cookies.length > 0) {
    const index = Math.floor(Math.random() * cookies.length);
    selected = cookies[index];
    global.currentRequestConfig.cookie = selected.startsWith('ui=') ? selected : `ui=${selected}`;
    global.currentRequestConfig.cookies = cookies.map(c => c.startsWith('ui=') ? c : `ui=${c}`);
    lastCookieStats = { selected: selected.slice(0, 16) + '...', index, total: cookies.length, remainingMB: null, timestamp: Date.now() };
    console.log(`[registry] Cookie random pick index=${index} total=${cookies.length}`);
  }
  try {
    const tmdbType = ctx.type === 'movie' ? 'movie' : 'tv';
    console.log(`[registry] Fetching Showbox streams for ${tmdbType} tmdbId=${ctx.tmdbId} season=${ctx.season||''} episode=${ctx.episode||''}`);
    const t0 = Date.now();
    const streams = await showbox.getStreamsFromTmdbId(tmdbType, ctx.tmdbId, ctx.season || null, ctx.episode || null, null, selected);
    const durationMs = Date.now() - t0;
    console.log(`[registry] Provider showbox fetch duration ${durationMs}ms`);
    if (global.currentRequestUserCookieRemainingMB != null) {
      lastCookieStats.remainingMB = global.currentRequestUserCookieRemainingMB;
    }
    console.log(`[registry] Showbox returned ${Array.isArray(streams)?streams.length:0} streams`);
    return Array.isArray(streams) ? streams : [];
  } catch (e) {
    console.error('[registry] Showbox fetch error:', e.message);
    return [];
  } finally {
    global.currentRequestConfig = previousConfig || {};
  }
}

const providers = [];

if (config.enableShowboxProvider) {
  providers.push({ name: 'showbox', enabled: true, fetch: fetchShowbox });
} else {
  console.log('[registry] showbox disabled via config');
}


// 4KHDHub adapter
async function fetch4khdhub(ctx) {
  if (!k4hdhub) {
    try { k4hdhub = require('./4khdhub.js'); } catch (e) { console.error('Failed to load 4khdhub provider:', e.message); return []; }
  }
  try {
    const mediaType = ctx.type === 'movie' ? 'movie' : 'tv';
    const t0 = Date.now();
    const result = await k4hdhub.get4KHDHubStreams(ctx.tmdbId, mediaType, ctx.season || null, ctx.episode || null);
    const durationMs = Date.now() - t0;
    console.log(`[registry] 4khdhub fetch duration ${durationMs}ms`);
    if (!Array.isArray(result)) return [];
    return result.map(s => ({ ...s, name: s.name || '4KHDHub', provider: '4khdhub' }));
  } catch (e) {
    console.error('[registry] 4khdhub fetch error:', e.message);
    return [];
  }
}

if (config.enable4khdhubProvider) {
  providers.push({ name: '4khdhub', enabled: true, fetch: fetch4khdhub });
  console.log('[registry] 4khdhub provider enabled');
} else {
  console.log('[registry] 4khdhub disabled via config');
}

// MoviesMod adapter
async function fetchMoviesMod(ctx) {
  if (!moviesmod) {
    try { moviesmod = require('./moviesmod.js'); } catch (e) { console.error('Failed to load moviesmod provider:', e.message); return []; }
  }
  try {
    const mediaType = ctx.type === 'movie' ? 'movie' : 'tv';
    const t0 = Date.now();
    const result = await moviesmod.getMoviesModStreams(ctx.tmdbId, mediaType, ctx.season || null, ctx.episode || null);
    const durationMs = Date.now() - t0;
    console.log(`[registry] moviesmod fetch duration ${durationMs}ms`);
    if (!Array.isArray(result)) return [];
    return result.map(s => ({ ...s, name: s.name || 'MoviesMod', provider: 'moviesmod' }));
  } catch (e) {
    console.error('[registry] moviesmod fetch error:', e.message);
    return [];
  }
}

if (config.enableMoviesmodProvider) {
  providers.push({ name: 'moviesmod', enabled: true, fetch: fetchMoviesMod });
  console.log('[registry] moviesmod provider enabled');
} else {
  console.log('[registry] moviesmod disabled via config');
}

// MP4Hydra adapter
async function fetchMp4hydra(ctx) {
  if (!mp4hydra) {
    try { mp4hydra = require('./MP4Hydra.js'); } catch (e) { console.error('Failed to load MP4Hydra provider:', e.message); return []; }
  }
  try {
    const mediaType = ctx.type === 'movie' ? 'movie' : 'tv';
    const t0 = Date.now();
    const result = await mp4hydra.getMP4HydraStreams(ctx.tmdbId, mediaType, ctx.season || null, ctx.episode || null);
    const durationMs = Date.now() - t0;
    console.log(`[registry] mp4hydra fetch duration ${durationMs}ms`);
    if (!Array.isArray(result)) return [];
    return result.map(s => ({ ...s, name: s.name || 'MP4Hydra', provider: 'mp4hydra' }));
  } catch (e) {
    console.error('[registry] mp4hydra fetch error:', e.message);
    return [];
  }
}

if (config.enableMp4hydraProvider) {
  providers.push({ name: 'mp4hydra', enabled: true, fetch: fetchMp4hydra });
  console.log('[registry] mp4hydra provider enabled');
} else {
  console.log('[registry] mp4hydra disabled via config');
}

// VidZee adapter
async function fetchVidZee(ctx) {
  if (!vidzee) {
    try { vidzee = require('./VidZee.js'); } catch (e) { console.error('Failed to load VidZee provider:', e.message); return []; }
  }
  try {
    const mediaType = ctx.type === 'movie' ? 'movie' : 'tv';
    const t0 = Date.now();
    const result = await vidzee.getVidZeeStreams(ctx.tmdbId, mediaType, ctx.season || null, ctx.episode || null);
    const durationMs = Date.now() - t0;
    console.log(`[registry] vidzee fetch duration ${durationMs}ms`);
    if (!Array.isArray(result)) return [];
    return result.map(s => ({ ...s, name: s.name || 'VidZee', provider: 'vidzee' }));
  } catch (e) {
    console.error('[registry] vidzee fetch error:', e.message);
    return [];
  }
}

if (config.enableVidzeeProvider) {
  providers.push({ name: 'vidzee', enabled: true, fetch: fetchVidZee });
  console.log('[registry] vidzee provider enabled');
} else {
  console.log('[registry] vidzee disabled via config');
}

// vixsrc adapter
async function fetchVixsrc(ctx) {
  if (!vixsrc) {
    try { vixsrc = require('./vixsrc.js'); } catch (e) { console.error('Failed to load vixsrc provider:', e.message); return []; }
  }
  try {
    const mediaType = ctx.type === 'movie' ? 'movie' : 'tv';
    const t0 = Date.now();
    const result = await vixsrc.getVixsrcStreams(ctx.tmdbId, mediaType, ctx.season || null, ctx.episode || null);
    const durationMs = Date.now() - t0;
    console.log(`[registry] vixsrc fetch duration ${durationMs}ms`);
    if (!Array.isArray(result)) return [];
    return result.map(s => ({ ...s, name: s.name || 'Vixsrc', provider: 'vixsrc' }));
  } catch (e) {
    console.error('[registry] vixsrc fetch error:', e.message);
    return [];
  }
}

if (config.enableVixsrcProvider) {
  providers.push({ name: 'vixsrc', enabled: true, fetch: fetchVixsrc });
  console.log('[registry] vixsrc provider enabled');
} else {
  console.log('[registry] vixsrc disabled via config');
}

// xprime adapter (requires TMDB metadata lookup for title/year)
async function fetchXprime(ctx) {
  if (!xprime) {
    try { xprime = require('./xprime.js'); } catch (e) { console.error('Failed to load xprime provider:', e.message); return []; }
  }
  try {
    const mediaType = ctx.type === 'movie' ? 'movie' : 'tv';
    const { getTmdbApiKey } = require('../utils/tmdbKey');
    const tmdbApiKey = getTmdbApiKey();
    if (!tmdbApiKey) {
      console.warn('[registry] xprime skipped: TMDB API key missing');
      return [];
    }
    // Fetch minimal TMDB metadata for title + year
    let title = null; let year = null;
    try {
      const axios = require('axios');
      const metaUrl = `https://api.themoviedb.org/3/${mediaType}/${ctx.tmdbId}?api_key=${tmdbApiKey}`;
      const { data: meta } = await axios.get(metaUrl, { timeout: 8000 });
      title = mediaType === 'movie' ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
      const dateStr = mediaType === 'movie' ? meta.release_date : meta.first_air_date;
      if (dateStr) year = dateStr.split('-')[0];
    } catch (mErr) {
      console.warn('[registry] xprime metadata fetch failed:', mErr.message);
      return [];
    }
    if (!title || !year) {
      console.log('[registry] xprime missing title/year after TMDB lookup');
      return [];
    }
    const t0 = Date.now();
  const streams = await xprime.getXprimeStreams(title, year, mediaType, ctx.season || null, ctx.episode || null, true, null);
    const durationMs = Date.now() - t0;
    console.log(`[registry] xprime fetch duration ${durationMs}ms (title='${title}' year=${year}) returned ${Array.isArray(streams)?streams.length:0}`);
    if (!Array.isArray(streams) || !streams.length) return [];
    // Normalize quality labels that are non-numeric (e.g., FHD/HD/SD)
    return streams.map(s => {
      let q = s.quality || 'Unknown';
      if (!/(\d{3,4})p/.test(q.toLowerCase())) {
        const qLower = q.toLowerCase();
        if (qLower.includes('fhd') || qLower.includes('full')) q = '1080p';
        else if (qLower === 'hd' || qLower.includes('720')) q = '720p';
        else if (qLower.includes('sd') || qLower.includes('480')) q = '480p';
        else if (qLower.includes('cam')) q = '360p';
      }
      return { ...s, quality: q, name: s.name || 'Xprime', provider: 'xprime' };
    });
  } catch (e) {
    console.error('[registry] xprime fetch error:', e.message);
    return [];
  }
}

if (config.enableXprimeProvider) {
  providers.push({ name: 'xprime', enabled: true, fetch: fetchXprime });
  console.log('[registry] xprime provider enabled');
} else {
  console.log('[registry] xprime disabled via config');
}

function listProviders() { return providers.map(p => ({ name: p.name, enabled: p.enabled })); }
function getProvider(name) { return providers.find(p => p.name === name.toLowerCase()) || null; }

function getCookieStats() { return lastCookieStats; }

module.exports = { listProviders, getProvider, getCookieStats };
