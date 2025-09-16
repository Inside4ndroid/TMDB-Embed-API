const { config } = require('./config');

function getTmdbApiKey() {
  if (config.tmdbApiKeys && config.tmdbApiKeys.length) {
    const idx = Math.floor(Math.random() * config.tmdbApiKeys.length);
    return config.tmdbApiKeys[idx];
  }
  // Fallback legacy single value (config or env)
  return config.tmdbApiKey || process.env.TMDB_API_KEY || null;
}

module.exports = { getTmdbApiKey };
