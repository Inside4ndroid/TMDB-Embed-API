const { config } = require('../utils/config');
const fs = require('fs');
const path = require('path');

// Lazy load cache for providers
const providerCache = new Map();

// Function name mappings for existing providers
const providerFunctionMap = {
  'Showbox.js': 'getStreamsFromTmdbId',
  '4khdhub.js': 'get4KHDHubStreams',
  'moviesmod.js': 'getMoviesModStreams',
  'MP4Hydra.js': 'getMP4HydraStreams',
  'VidZee.js': 'getVidZeeStreams',
  'vixsrc.js': 'getVixsrcStreams',
  'uhdmovies.js': 'getUHDMoviesStreams',
};

// Stats for debug endpoint
let lastCookieStats = { selected: null, index: null, total: 0, remainingMB: null, timestamp: null };

async function getEffectiveCookies() {
  return Array.isArray(config.febboxCookies) ? config.febboxCookies : [];
}

// Get all provider files
function getProviderFiles() {
  const providersDir = path.join(__dirname);
  return fs.readdirSync(providersDir)
    .filter(file => file.endsWith('.js') && file !== 'registry.js' && file !== 'vidsrcextractor.js')
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

      // Add provider name if not present
      return result.map(s => ({ ...s, provider: s.provider || providerInfo.name }));

    } catch (e) {
      console.error(`[registry] ${providerInfo.name} fetch error:`, e.message);
      return [];
    }
  };
}

// Initialize providers
const providerFiles = getProviderFiles();
const providers = [];

for (const providerInfo of providerFiles) {
  const enableFlag = `enable${providerInfo.name.charAt(0).toUpperCase() + providerInfo.name.slice(1)}Provider`;
  const enabled = config[enableFlag] !== false;

  if (enabled) {
    providers.push({
      name: providerInfo.name,
      enabled: true,
      fetch: createFetchFunction(providerInfo)
    });
    console.log(`[registry] ${providerInfo.name} provider enabled`);
  } else {
    console.log(`[registry] ${providerInfo.name} disabled via config`);
  }
}

function listProviders() { return providers.map(p => ({ name: p.name, enabled: p.enabled })); }
function getProvider(name) { return providers.find(p => p.name === name.toLowerCase()) || null; }

function getCookieStats() { return lastCookieStats; }

module.exports = { listProviders, getProvider, getCookieStats };
