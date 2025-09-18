// MoviesClub Provider
// Extracts streams from moviesapi.club

const axios = require('axios');
const JsUnpacker = require('../utils/jsunpack');

async function getMoviesClubStreams(tmdbId, mediaType, season, episode) {
  console.log(`[moviesclub] Fetching streams for ${mediaType} tmdbId=${tmdbId} season=${season} episode=${episode}`);

  const streams = [];

  try {
    // Build the URL based on media type
    let url;
    if (mediaType === 'movie') {
      url = `https://moviesapi.club/movie/${tmdbId}`;
    } else if (mediaType === 'tv' && season && episode) {
      url = `https://moviesapi.club/tv/${tmdbId}-${season}-${episode}`;
    } else {
      console.log('[moviesclub] Invalid parameters for TV show');
      return [];
    }

    console.log(`[moviesclub] Fetching from: ${url}`);

    // Fetch the main page
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const html = response.data;
    console.log(`[moviesclub] Fetched ${html.length} characters`);

    // Extract data-url from srvswitch-menu
    const dataUrlMatch = html.match(/data-url="([^"]+)"/);
    if (!dataUrlMatch) {
      console.log('[moviesclub] No data-url found in HTML');
      return [];
    }

    const embedUrl = dataUrlMatch[1];
    console.log(`[moviesclub] Found embed URL: ${embedUrl}`);

    // Check if this is a cdn.moviesapi.club embed URL with multiple servers
    if (embedUrl.includes('cdn.moviesapi.club')) {
      console.log('[moviesclub] Detected cdn.moviesapi.club embed URL, handling multiple servers');
      return await handleMultipleServers(embedUrl, mediaType, season, episode, tmdbId);
    }

    // Handle regular embed URLs (existing logic)
    return await handleSingleServer(embedUrl, mediaType, season, episode, tmdbId);

  } catch (error) {
    console.error(`[moviesclub] Error:`, error.message);
    return [];
  }
}

// Handle cdn.moviesapi.club URLs with multiple servers
async function handleMultipleServers(embedUrl, mediaType, season, episode, tmdbId) {
  console.log(`[moviesclub] Handling multiple servers from: ${embedUrl}`);

  const streams = [];

  try {
    // Fetch the embed page
    const embedResponse = await axios.get(embedUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      }
    });

    const embedHtml = embedResponse.data;
    console.log(`[moviesclub] Fetched embed page: ${embedHtml.length} characters`);

    // Extract server options from the HTML
    const serverMatches = embedHtml.match(/<div class="server"[^>]*data-hash="([^"]+)"[^>]*>([^<]+)<\/div>/gi);

    if (!serverMatches || serverMatches.length === 0) {
      console.log('[moviesclub] No server options found, trying direct iframe extraction');
      // Try to extract the main iframe src
      const iframeMatch = embedHtml.match(/<iframe[^>]*src="([^"]*)"[^>]*>/i);
      if (iframeMatch) {
        const iframeSrc = iframeMatch[1];
        console.log(`[moviesclub] Found iframe src: ${iframeSrc}`);

        // Try to decode if it's base64
        try {
          const decodedSrc = Buffer.from(iframeSrc.split('/').pop(), 'base64').toString('utf-8');
          console.log(`[moviesclub] Decoded iframe src: ${decodedSrc}`);

          // If it's a URL, use it directly
          if (decodedSrc.startsWith('http')) {
            const stream = {
              name: `MoviesClub - Direct Stream`,
              title: `${mediaType === 'movie' ? 'Movie' : `S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`} ${tmdbId} - MoviesClub Direct`,
              url: decodedSrc,
              quality: extractQualityFromUrl(decodedSrc) || '720p'
            };
            streams.push(stream);
            console.log(`[moviesclub] Added direct stream from iframe`);
            return streams;
          }
        } catch (decodeError) {
          console.log(`[moviesclub] Could not decode iframe src: ${decodeError.message}`);
        }
      }
      return streams;
    }

    console.log(`[moviesclub] Found ${serverMatches.length} server options`);

    // Process each server
    for (let i = 0; i < serverMatches.length; i++) {
      const serverMatch = serverMatches[i];
      const hashMatch = serverMatch.match(/data-hash="([^"]+)"/);
      const nameMatch = serverMatch.match(/>([^<]+)<\/div>/);

      if (!hashMatch || !nameMatch) {
        console.log(`[moviesclub] Could not parse server ${i + 1}, skipping`);
        continue;
      }

      const encodedHash = hashMatch[1];
      const serverName = nameMatch[1].trim();

      console.log(`[moviesclub] Processing server ${i + 1}: ${serverName}`);

      try {
        // Construct the rcp URL from the hash
        const rcpUrl = `https://cloudnestra.com/rcp/${encodedHash}`;
        console.log(`[moviesclub] RCP URL: ${rcpUrl}`);

        // Fetch the rcp URL to get the JavaScript with prorcp URL
        const rcpResponse = await axios.get(rcpUrl, {
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Referer': embedUrl
          }
        });

        const rcpHtml = rcpResponse.data;
        console.log(`[moviesclub] RCP response length: ${rcpHtml.length}`);

        // Extract prorcp URL from the JavaScript
        const prorcpMatch = rcpHtml.match(/src:\s*['"]([^'"]*prorcp[^'"]*)['"]/i);
        if (!prorcpMatch) {
          // Try alternative patterns
          const altMatch = rcpHtml.match(/['"](\/prorcp\/[^'"]*)['"]/i);
          if (altMatch) {
            prorcpUrl = altMatch[1];
          } else {
            console.log(`[moviesclub] No prorcp URL found in rcp response`);
            continue;
          }
        } else {
          prorcpUrl = prorcpMatch[1];
        }

        console.log(`[moviesclub] Found prorcp URL: ${prorcpUrl}`);

        // If it's a relative URL, make it absolute
        if (prorcpUrl.startsWith('/')) {
          prorcpUrl = `https://cloudnestra.com${prorcpUrl}`;
          console.log(`[moviesclub] Converted to absolute URL: ${prorcpUrl}`);
        }

        // Fetch the prorcp URL to get the player HTML
        const prorcpResponse = await axios.get(prorcpUrl, {
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Referer': rcpUrl
          }
        });

        const prorcpHtml = prorcpResponse.data;
        console.log(`[moviesclub] Prorcp response length: ${prorcpHtml.length}`);

        // Extract stream URL from Playerjs configuration
        const streamUrl = extractStreamFromPlayerjsUpdated(prorcpHtml);
        if (!streamUrl) {
          console.log(`[moviesclub] No stream URL found in prorcp response`);
          continue;
        }

        console.log(`[moviesclub] Extracted stream URL: ${streamUrl.substring(0, 100)}...`);

        // Create stream object
        const stream = {
          name: `MoviesClub - ${serverName}`,
          title: `${mediaType === 'movie' ? 'Movie' : `S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`} ${tmdbId} - ${serverName}`,
          url: streamUrl,
          quality: extractQualityFromUrl(streamUrl) || '720p',
          headers: {}
        };

        streams.push(stream);
        console.log(`[moviesclub] Added stream from server: ${serverName}`);

      } catch (serverError) {
        console.error(`[moviesclub] Error processing server ${serverName}:`, serverError.message);
        continue;
      }
    }

    console.log(`[moviesclub] Total streams found: ${streams.length}`);
    return streams;

  } catch (error) {
    console.error(`[moviesclub] Error in handleMultipleServers:`, error.message);
    return [];
  }
}

// Handle regular embed URLs (existing logic)
async function handleSingleServer(embedUrl, mediaType, season, episode, tmdbId) {
  console.log(`[moviesclub] Handling single server from: ${embedUrl}`);

  const streams = [];

  try {
    // Fetch the embed page
    const embedResponse = await axios.get(embedUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      }
    });

    const embedHtml = embedResponse.data;
    console.log(`[moviesclub] Fetched embed page: ${embedHtml.length} characters`);

    // Look for packed JavaScript using JsUnpacker.detect()
    const scriptTags = embedHtml.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
    let packedCode = null;

    for (const scriptTag of scriptTags) {
      // Extract script content
      const scriptContent = scriptTag.replace(/<\/?script[^>]*>/gi, '').trim();

      if (scriptContent) {
        // Create unpacker instance and check if it's packed
        const unpacker = new JsUnpacker(scriptContent);

        if (unpacker.detect()) {
          console.log(`[moviesclub] Found packed JavaScript in script tag, length: ${scriptContent.length}`);
          packedCode = scriptContent;
          break;
        }
      }
    }

    if (!packedCode) {
      console.log('[moviesclub] No packed JavaScript found');
      return [];
    }

    // Unpack using JsUnpacker
    const unpacker = new JsUnpacker(packedCode);
    const unpackedCode = unpacker.unpack();

    if (!unpackedCode) {
      console.log('[moviesclub] Failed to unpack JavaScript');
      return [];
    }

    console.log(`[moviesclub] Successfully unpacked code, length: ${unpackedCode.length}`);

    // Parse the player configuration from unpacked code
    const playerConfig = parsePlayerConfig(unpackedCode);
    if (!playerConfig) {
      console.log('[moviesclub] Failed to parse player configuration');
      return [];
    }

    console.log('[moviesclub] Parsed player config:', playerConfig);

    // Extract streams from the configuration
    if (playerConfig.file) {
      const stream = {
        name: `MoviesClub - ${playerConfig.title || 'Server 1'}`,
        title: playerConfig.title || `${mediaType === 'movie' ? 'Movie' : `S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`} ${tmdbId} - MoviesClub`,
        url: playerConfig.file,
        quality: extractQualityFromUrl(playerConfig.file) || '720p',
        headers: {}
      };

      // Add poster if available
      if (playerConfig.poster) {
        stream.poster = playerConfig.poster;
      }

      // Add subtitles if available
      if (playerConfig.subtitle) {
        stream.subtitles = parseSubtitles(playerConfig.subtitle);
      }

      streams.push(stream);
    }

    console.log(`[moviesclub] Found ${streams.length} streams`);
    return streams;

  } catch (error) {
    console.error(`[moviesclub] Error in handleSingleServer:`, error.message);
    return [];
  }
}

// Extract stream URL from Playerjs configuration in HTML
function extractStreamFromPlayerjs(html) {
  try {
    // Look for the Playerjs constructor call
    const playerMatch = html.match(/new Playerjs\(\s*(\{[^}]*\})\s*\)/);
    if (!playerMatch) {
      console.log('[moviesclub] No Playerjs constructor found in HTML');
      return null;
    }

    const configStr = playerMatch[1];
    console.log(`[moviesclub] Found Playerjs config: ${configStr.substring(0, 200)}...`);

    // Extract the file URL from the configuration
    const fileMatch = configStr.match(/file:\s*['"]([^'"]+)['"]/);
    if (!fileMatch) {
      console.log('[moviesclub] No file URL found in Playerjs config');
      return null;
    }

    const streamUrl = fileMatch[1];
    console.log(`[moviesclub] Extracted stream URL from Playerjs: ${streamUrl.substring(0, 100)}...`);

    return streamUrl;

  } catch (error) {
    console.error('[moviesclub] Error extracting stream from Playerjs:', error.message);
    return null;
  }
}

// Extract streams from server response
function extractStreamsFromServer(serverData, serverName, mediaType, season, episode, tmdbId) {
  const streams = [];

  try {
    // Handle different response formats
    if (typeof serverData === 'string') {
      // Try to parse as JSON
      try {
        serverData = JSON.parse(serverData);
      } catch (parseError) {
        console.log(`[moviesclub] Server response is not JSON, treating as direct URL: ${serverData.substring(0, 100)}`);
        // Treat as direct stream URL
        if (serverData.startsWith('http')) {
          const stream = {
            name: `MoviesClub - ${serverName}`,
            title: `${mediaType === 'movie' ? 'Movie' : `S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`} ${tmdbId} - ${serverName}`,
            url: serverData,
            quality: extractQualityFromUrl(serverData) || '720p',
            headers: {}
          };
          streams.push(stream);
        }
        return streams;
      }
    }

    // Handle JSON response
    if (serverData && typeof serverData === 'object') {
      // Look for common stream URL patterns
      const possibleKeys = ['file', 'url', 'src', 'stream', 'video', 'source'];

      for (const key of possibleKeys) {
        if (serverData[key] && typeof serverData[key] === 'string' && serverData[key].startsWith('http')) {
          console.log(`[moviesclub] Found stream URL in key '${key}': ${serverData[key].substring(0, 100)}`);

          const stream = {
            name: `MoviesClub - ${serverName}`,
            title: `${mediaType === 'movie' ? 'Movie' : `S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`} ${tmdbId} - ${serverName}`,
            url: serverData[key],
            quality: extractQualityFromUrl(serverData[key]) || '720p',
            headers: {}
          };

          // Add poster if available
          if (serverData.poster) {
            stream.poster = serverData.poster;
          }

          // Add subtitles if available
          if (serverData.subtitle || serverData.subtitles) {
            const subtitleData = serverData.subtitle || serverData.subtitles;
            stream.subtitles = parseSubtitles(subtitleData);
          }

          streams.push(stream);
          break; // Only take the first valid stream URL
        }
      }

      // If no direct URL found, check for nested objects
      if (streams.length === 0) {
        for (const key of possibleKeys) {
          if (serverData[key] && typeof serverData[key] === 'object') {
            const nestedStreams = extractStreamsFromServer(serverData[key], serverName, mediaType, season, episode, tmdbId);
            streams.push(...nestedStreams);
          }
        }
      }
    }

  } catch (error) {
    console.error(`[moviesclub] Error extracting streams from server ${serverName}:`, error.message);
  }

  return streams;
}

// Extract stream URL from Playerjs configuration in HTML
function extractStreamFromPlayerjs(html) {
  try {
    // Look for the Playerjs constructor call
    const playerMatch = html.match(/new Playerjs\(\s*(\{[^}]*\})\s*\)/);
    if (!playerMatch) {
      console.log('[moviesclub] No Playerjs constructor found in HTML');
      return null;
    }

    const configStr = playerMatch[1];
    console.log(`[moviesclub] Found Playerjs config: ${configStr.substring(0, 200)}...`);

    // Extract the file URL from the configuration
    const fileMatch = configStr.match(/file:\s*['"]([^'"]+)['"]/);
    if (!fileMatch) {
      console.log('[moviesclub] No file URL found in Playerjs config');
      return null;
    }

    const streamUrl = fileMatch[1];
    console.log(`[moviesclub] Extracted stream URL from Playerjs: ${streamUrl.substring(0, 100)}...`);

    return streamUrl;

  } catch (error) {
    console.error('[moviesclub] Error extracting stream from Playerjs:', error.message);
    return null;
  }
}

// Parse player configuration from unpacked JavaScript
function parsePlayerConfig(unpackedCode) {
  try {
    // Look for the player configuration object
    const configMatch = unpackedCode.match(/new Playerjs\(\s*(\{[^}]*\})\s*\)/);
    if (!configMatch) {
      return null;
    }

    // Extract the configuration object
    const configStr = configMatch[1];

    // Parse the configuration (this is a simple parser for the expected format)
    const config = {};

    // Extract key-value pairs
    const pairs = configStr.match(/(\w+):"([^"]*)"/g) || [];
    pairs.forEach(pair => {
      const [, key, value] = pair.match(/(\w+):"([^"]*)"/);
      config[key] = value;
    });

    // Also handle non-quoted values
    const numberPairs = configStr.match(/(\w+):(\d+(?:\.\d+)?)/g) || [];
    numberPairs.forEach(pair => {
      const [, key, value] = pair.match(/(\w+):(\d+(?:\.\d+)?)/);
      config[key] = parseFloat(value);
    });

    return config;
  } catch (error) {
    console.error('[moviesclub] Error parsing player config:', error.message);
    return null;
  }
}

// Parse subtitles from the subtitle string
function parseSubtitles(subtitleStr) {
  if (!subtitleStr) return [];

  const subtitles = [];
  const subtitleMatches = subtitleStr.match(/\[([^\]]+)\]([^,\[]*)/g);

  if (subtitleMatches) {
    subtitleMatches.forEach(match => {
      const [, language, url] = match.match(/\[([^\]]+)\]([^,\[]*)/);
      if (url && url.trim()) {
        subtitles.push({
          language: language.trim(),
          url: url.trim(),
          type: 'vtt'
        });
      }
    });
  }

  return subtitles;
}

// Extract quality from URL
function extractQualityFromUrl(url) {
  if (!url) return '720p';

  const qualityPatterns = [
    { pattern: /1080p|1080/i, quality: '1080p' },
    { pattern: /720p|720/i, quality: '720p' },
    { pattern: /480p|480/i, quality: '480p' },
    { pattern: /360p|360/i, quality: '360p' },
    { pattern: /2160p|4k|uhd/i, quality: '2160p' }
  ];

  for (const { pattern, quality } of qualityPatterns) {
    if (pattern.test(url)) {
      return quality;
    }
  }

  return '720p';
}

// Extract stream URL from Playerjs configuration in HTML (updated version)
function extractStreamFromPlayerjsUpdated(html) {
  try {
    // Look for the Playerjs constructor call
    const playerMatch = html.match(/new Playerjs\(\s*(\{[^}]*\})\s*\)/);
    if (!playerMatch) {
      console.log('[moviesclub] No Playerjs constructor found in HTML');
      return null;
    }

    const configStr = playerMatch[1];
    console.log(`[moviesclub] Found Playerjs config: ${configStr.substring(0, 200)}...`);

    // Extract the file URL from the configuration
    let streamUrl = null;

    // Try multiple patterns to extract the file URL
    const patterns = [
      /file:\s*['"]([^'"]+)['"]/,
      /file:\s*([^,\s}]+)/,
      /file\s*:\s*['"]([^'"]+)['"]/,
      /file\s*:\s*([^,\s}]+)/
    ];

    for (const pattern of patterns) {
      const match = configStr.match(pattern);
      if (match && match[1] && match[1].trim() !== '' && match[1].trim() !== '""') {
        streamUrl = match[1].replace(/['"]/g, '').trim();
        console.log(`[moviesclub] Found stream URL with pattern: ${streamUrl.substring(0, 100)}...`);
        break;
      }
    }

    // If no URL found in config, look for streaming URLs in the HTML
    if (!streamUrl) {
      console.log('[moviesclub] No file URL in Playerjs config, searching HTML for streaming URLs...');

      // Look for m3u8 URLs
      const m3u8Match = html.match(/https?:\/\/[^'"\s]+\.m3u8[^'"\s]*/i);
      if (m3u8Match) {
        streamUrl = m3u8Match[0];
        console.log(`[moviesclub] Found m3u8 URL in HTML: ${streamUrl.substring(0, 100)}...`);
      }

      // Look for other streaming URLs
      if (!streamUrl) {
        const streamMatch = html.match(/https?:\/\/[^'"\s]+(?:\.mp4|\.m3u8|\.ts)[^'"\s]*/i);
        if (streamMatch) {
          streamUrl = streamMatch[0];
          console.log(`[moviesclub] Found streaming URL in HTML: ${streamUrl.substring(0, 100)}...`);
        }
      }
    }

    if (!streamUrl) {
      console.log('[moviesclub] No file URL found in Playerjs config after trying all patterns');
      console.log('[moviesclub] Config string:', configStr.substring(0, 500));
      return null;
    }

    console.log(`[moviesclub] Extracted stream URL from Playerjs: ${streamUrl.substring(0, 100)}...`);

    return streamUrl;

  } catch (error) {
    console.error('[moviesclub] Error extracting stream from Playerjs:', error.message);
    return null;
  }
}

module.exports = {
  getMoviesClubStreams
};