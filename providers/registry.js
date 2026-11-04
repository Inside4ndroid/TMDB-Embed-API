const { config } = require('../utils/config');
const fs = require('fs');
const path = require('path');

// Lazy load cache for providers
const providerCache = new Map();

// Function name mappings for existing providers
const providerFunctionMap = {
  'Showbox.js': 'getStreamsFromTmdbId',
  '4khdhub.js': 'get4KHDHubStreams',
  'vixsrc.js': 'getVixsrcStreams',
  'videasy.js': 'getVideasyStreams',
  'vidlink.js': 'getVidlinkStreams',
  'dahmermovies.js': 'getDahmermoviesStreams',
  'streamflix.js': 'getStreamflixStreams',
  'vaplayer.js': 'getVaplayerStreams',
  'castletv.js': 'getCastletvStreams',
  'hdghartv.js': 'getHdghartvStreams',
  'netmirror.js': 'getNetmirrorStreams',
  'onetouchtv.js': 'getOnetouchtvStreams',
  'zxcstreams.js': 'getZxcstreamsStreams',
};


// ---------------------------------------------------------------------------
// Stream normalization: har provider alag shape deta tha (type/resolution gayab),
// isliye player HLS ko MP4 samajh leta tha. Ab sab streams ek format me aate hain.
// ---------------------------------------------------------------------------
const PROVIDER_TYPE_HINT = { vaplayer: 'hls', vixsrc: 'hls' }; // ye hamesha HLS dete hain
const KNOWN_HEIGHTS = [240, 360, 480, 540, 576, 720, 1080, 1440, 2160];

function detectType(url, hint) {
  if (hint === 'hls' || hint === 'mp4') return hint;
  const u = String(url).toLowerCase();
  if (u.includes('m3u8')) return 'hls';
  if (/\.(mp4|m4v|webm|mkv|avi)(\?|#|&|$)/.test(u)) return 'mp4';
  return undefined; // pata nahi: player content dekh ke khud pehchanega
}

function parseHeight(...texts) {
  for (const t of texts) {
    if (t == null) continue;
    const str = String(t).trim();
    const m = /(\d{3,4})\s*p\b/i.exec(str) || /^(\d{3,4})$/.exec(str);
    if (m && KNOWN_HEIGHTS.includes(Number(m[1]))) return Number(m[1]);
    if (/\b(4k|uhd)\b/i.test(str)) return 2160;
  }
  return null;
}

function normalizeStream(raw, providerName) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.url !== 'string' || !/^https?:\/\//i.test(raw.url)) return null;
  const out = { ...raw, provider: raw.provider || providerName };

  const declared = typeof raw.type === 'string' ? raw.type.toLowerCase() : '';
  const type = detectType(raw.url, declared === 'hls' || declared === 'mp4' ? declared : undefined)
    || PROVIDER_TYPE_HINT[providerName];
  if (type) out.type = type; else delete out.type;

  if (/\.mkv(\?|#|&|$)/i.test(raw.url)) out.container = 'mkv'; // Chrome me aksar nahi chalta (HEVC/AC3)

  const given = Number(raw.resolution);
  if (given > 0) out.resolution = given;
  else {
    const h = parseHeight(raw.resolution, raw.quality, raw.name, raw.title);
    if (h) out.resolution = h; else delete out.resolution;
  }

  if (!out.headers || typeof out.headers !== 'object' || Array.isArray(out.headers)) out.headers = {};
  return out;
}

// Stats for debug endpoint
let lastCookieStats = { selected: null, index: null, total: 0, remainingMB: null, timestamp: null };

async function getEffectiveCookies() {
  return Array.isArray(config.febboxCookies) ? config.febboxCookies : [];
}

// Get all provider files
function getProviderFiles() {
  const providersDir = path.join(__dirname);
  return fs.readdirSync(providersDir)
    .filter(file => file.endsWith('.js') && file !== 'registry.js')
    .map(file => ({
      name: path.parse(file).name.toLowerCase(),
      file: file,
      functionName: providerFunctionMap[file]
    }));
}

// Load a provider module
function loadProvider(providerFile) {
  if (!providerCache.has(providerFile)) {
    try {
      providerCache.set(providerFile, require(path.join(__dirname, providerFile)));
    } catch (e) {
      console.error(`Failed to load provider ${providerFile}:`, e.message);
      return null;
    }
  }
  return providerCache.get(providerFile);
}

// Create fetch function for a provider
function createFetchFunction(providerInfo) {
  return async function(ctx) {
    const module = loadProvider(providerInfo.file);
    if (!module) return [];

    const funcName = providerInfo.functionName;
    if (!module[funcName]) {
      console.error(`Provider ${providerInfo.name} does not export ${funcName}`);
      return [];
    }

    try {
      const mediaType = ctx.type === 'movie' ? 'movie' : 'tv';
      const t0 = Date.now();

      let result;
      if (providerInfo.name === 'showbox') {
        // Special case for Showbox with TMDB key and cookies
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
        result = await module[funcName](mediaType, ctx.tmdbId, ctx.season || null, ctx.episode || null, null, selected);
        if (global.currentRequestUserCookieRemainingMB != null) {
          lastCookieStats.remainingMB = global.currentRequestUserCookieRemainingMB;
        }
        global.currentRequestConfig = previousConfig || {};
      } else {
        // Standard provider call
        result = await module[funcName](ctx.tmdbId, mediaType, ctx.season || null, ctx.episode || null);
      }

      const durationMs = Date.now() - t0;
      console.log(`[registry] ${providerInfo.name} fetch duration ${durationMs}ms`);

      if (!Array.isArray(result)) return [];

      // Provider name + type/resolution/headers normalize
      return result.map(s => normalizeStream(s, providerInfo.name)).filter(Boolean);

    } catch (e) {
      console.error(`[registry] ${providerInfo.name} fetch error:`, e.message);
      return [];
    }
  };
}

// Initialize providers - always load all; enabled state is checked dynamically from live config
const providerFiles = getProviderFiles();
const providers = [];

for (const providerInfo of providerFiles) {
  providers.push({
    name: providerInfo.name,
    fetch: createFetchFunction(providerInfo)
  });
  console.log(`[registry] ${providerInfo.name} provider loaded`);
}

function isProviderEnabled(name) {
  const flag = `enable${name.charAt(0).toUpperCase() + name.slice(1)}Provider`;
  return config[flag] !== false;
}

function listProviders() { return providers.map(p => ({ name: p.name, enabled: isProviderEnabled(p.name) })); }
function getProvider(name) {
  const p = providers.find(p => p.name === name.toLowerCase());
  if (!p) return null;
  return { ...p, enabled: isProviderEnabled(p.name) };
}

function getCookieStats() { return lastCookieStats; }

module.exports = { listProviders, getProvider, getCookieStats, normalizeStream };
