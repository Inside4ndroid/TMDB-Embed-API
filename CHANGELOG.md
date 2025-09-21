# Changelog

All notable changes to this project will be documented in this file.

## [1.0.7] - 2025-09-21

### Added
- VidZee provider: definitive AES-256-CBC decoder (replaced heuristic token attempts). Decodes newly obfuscated `atob(token) => ivBase64:cipherBase64` structure using padded key `qrincywincyspider` and PKCS7.
- Tail segment acceleration: internal tail prefetch map (`tailPrefetchMap`) with TTL cleanup and configurable `tailPrefetchKB` (default 256 KB) now documented and instrumented.

### Changed
- Proxy range negotiation: clarified interaction between `progressiveOpen` and synthetic initial partial (auto-suppression when progressive active). Additional debug logging around tail cache hits and forced host overrides.
- VidZee streams now always return direct decrypted URLs (per-stream `originalToken` retained for debugging when `VIDZEE_DEBUG=1`).
- Updated README version badge to 1.0.7.

### Fixed
- Eliminated edge cases where encoded VidZee tokens were leaking through without decoding.
- Reduced VLC initial loop behavior via tail prefetch serving last-byte probes from cache faster (combined with earlier 1.0.6 range logic).

### Documentation
- README: implicit improvements carried forward (no separate section required) plus badge bump.
- CHANGELOG: recorded AES decoder details & tail prefetch instrumentation.

### Notes
- Future proxy tuning items (size meta map, dynamic progressive growth) tracked but not part of this release.


## [1.0.6] - 2025-09-20

### Removed
- MoviesClub provider (multi-server scraping complexities & Turnstile challenge; deprecated permanently)
- Xprime provider (upstream Xprime.tv offline due to security changes)
 - 4khdhub provider: all `.zip` archive links are now omitted entirely (previous releases experimented with stripping the extension which produced non‑playable pseudo‑MKV links)

### Added
- Structured multi-server debug instrumentation (session summaries, per-fetch metrics, pattern counters)
- Turnstile challenge detection & bypass attempt scaffold (synthetic `/rcp_verify` token posting)
- Optional internal stream proxy (`enableProxy` flag): mounts `/m3u8-proxy`, `/ts-proxy`, `/sub-proxy` with playlist + segment + subtitle handling and segment prefetch cache.
 - Proxy range management features:
   - `clampOpen` (default on) – caps ambiguous open‑ended `bytes=0-` requests to a bounded initial window (`openChunkKB`, default 4096 KB)
   - `progressiveOpen` (default on) – incremental expansion of the head range on successive `bytes=0-` requests instead of a single huge span
   - `initChunkKB` (default 512 KB) – size of the synthetic initial 206 response when neither clamp/progressive produce a range and `noSynth` is not set
   - `tailPrefetch` (default on) + `tailPrefetchKB` (default 256 KB) – asynchronous fetch & in‑memory cache of the file tail to satisfy rapid VLC tail probes
   - `force200` (opt‑in) – normalizes upstream 206 responses to 200 for diagnostics
   - `noSynth` (opt‑in) – disables synthetic initial partial response generation
 - Tail prefetch TTL cleanup task (30 min window) and in‑memory maps for: segment cache, open range clamp, progressive growth, and tail buffers
 - Host routing overrides: `pixeldrain.*` & `video-downloads.googleusercontent.com` are forced through `/ts-proxy` (extensionless or ambiguous content)

### Changed
- Centralized multi-server request headers with realistic `sec-ch-ua*` & `Sec-Fetch-*` values
- Added retry, rotating User-Agent, and cookie jar logic to multi-server fetch pipeline
- Showbox provider priority map updated after Xprime removal
- README/Docs trimmed to reflect current active providers only
- When `enableProxy` is active, stream response objects have their original `headers` field removed (proxy handles all required headers internally).
 - 4khdhub provider now filters out archive endpoints instead of attempting extension normalization (prevents feeding ZIP files to players)
 - Open‑ended range handling improved to reduce VLC negotiation loops by throttling first‑pass read size and growing progressively
 - Synthetic initial partial response is automatically suppressed when `progressiveOpen` is active (real range growth preferred)

### Fixed
- Ensured multi-server fallback attempts (direct rcp player/m3u8 extraction) operate with improved diagnostics
 - Eliminated repeated VLC tail probe stalls caused by archive masquerading as video content (root cause was filtered by dropping `.zip` URLs)

### Documentation
 - Updated README version badge to 1.0.6 and provider list (removed MoviesClub & Xprime, clarified active providers list)
 - Added proxy tuning parameter reference (clamp/progressive/tail prefetch, synthetic partial, force200) and host override notes
 - Expanded explanation that per‑stream headers are stripped when proxying is enabled


## [1.0.5] - 2025-09-19

### Improved
- 4khdhub provider: Permanently block `r2.dev` FSL links (previous optional flag removed).
- Added Referer/Origin headers automatically for FSL Server links during validation (prior to block enforcement ensured proper behavior).
- Tightened URL validation: removed unconditional trust for `r2.dev`; validation logic now consistent across hosts.
- Host distribution instrumentation logs final hostname counts for easier diagnostics.
- Preserved HubCloud worker `.zip` links by stripping the `.zip` extension instead of discarding them (enables direct playback attempts).

### Notes
- `r2.dev` links are always removed from final output; no env flag required.

### Documentation

## [1.0.4] - 2025-09-18

### Added

### Changed
  ```json
  { "title": "…", "url": "…", "quality": "…", "provider": "…", "headers": { } }
  ```

## [1.0.3] - 2025-09-17

### Fixed
- Server now binds to `0.0.0.0` by default so Docker port publishing works correctly from the host. Added `BIND_HOST=0.0.0.0` in Dockerfile and compose.

### Notes
- If you were seeing `ERR_CONNECTION_REFUSED` on `http://localhost:8787`, pull the latest image or rebuild, then re-run with `-p 8787:8787`.

## [1.0.2] - 2025-09-17

### Fixed
- Standardized Docker port to `8787` everywhere (Dockerfile `EXPOSE`, compose `ports`, healthchecks, and README examples). Previous release notes mentioned 8787 but some environments weren't reset; this release ensures consistency.

### Documentation
- Updated README version badge to 1.0.2 and verified Docker commands use `-p 8787:8787`.

## [1.0.1] - 2025-09-17

### Added
- Admin UI: Restart Server button (below Logout) with a themed confirmation modal. The UI polls `/api/health` and auto-reloads when the server is back.
- Sidebar divider under Logout/Restart for clarity.

### Changed
- Exclude Codecs presets:
  - Introduced "None" (default) → `{ "excludeDV": false, "excludeHDR": false }`.
  - "All" → `{ "excludeDV": true, "excludeHDR": true }`.
  - Persist and render presets reliably after Save / Reload.
- Minimum Quality: Clear All now resets to `"all"` and selects the All preset in the UI.
- Clear All: Now fully resets TMDB keys, FebBox cookies, providers, and filters; added a themed confirmation modal with optional "Don't ask again" preference.
- Live Config: Hide legacy `tmdbApiKey` (only show `tmdbApiKeys`).
- Restart behavior:
  - Local dev: Nodemon watches `restart.trigger`; backend writes it before a clean exit to force a restart.
  - Docker: Compose uses `restart: unless-stopped`; Docker restarts the container after restart endpoint triggers exit.
- Dockerfile: Ensure non-root `app` user owns `/app` for writing overrides and restart marker.
- package.json scripts: Simplified to `start`, `start:dev`, and `lint`; both start scripts are nodemon-based and watch `restart.trigger`.

### Fixed
- Provider matrix re-renders immediately after Clear All (no page refresh needed).
- Handling of Exclude Codecs "ALL" previously not persisting correctly.

## [1.0.0] - 2025-09-16
- Initial stable release.

[1.0.7]: https://github.com/Inside4ndroid/TMDB-Embed-API/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/Inside4ndroid/TMDB-Embed-API/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/Inside4ndroid/TMDB-Embed-API/compare/v1.0.4...v1.0.5
[1.0.3]: https://github.com/Inside4ndroid/TMDB-Embed-API/compare/v1.0.2...v1.0.3
[1.0.4]: https://github.com/Inside4ndroid/TMDB-Embed-API/compare/v1.0.3...v1.0.4
[1.0.2]: https://github.com/Inside4ndroid/TMDB-Embed-API/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Inside4ndroid/TMDB-Embed-API/compare/v1.0.0...v1.0.1

## [1.0.0] - 2025-09-16

### Added
- Comprehensive `README.md` (features, endpoints, admin UI overview, screenshots gallery, Docker usage, troubleshooting).
- `LICENSE` (MIT) file.
- Multi‑TMDB key rotation support (array of keys; random selection per request).
- Config override system writing to `utils/user-config.json` with live merged view.
- Session-based authentication (login, logout, session check, password change) with brute-force mitigation.
- Rate limiting + exponential lockouts for failed login attempts.
- Provider status & metrics endpoints: `/api/health`, `/api/metrics`, `/api/status`, `/api/providers`.
- Stream aggregation endpoints (aggregate + provider-specific) with filtering pipeline.
- Diagnostics instrumentation (intercept `process.exit`, `beforeExit`, unhandled rejection / exception logging, periodic heartbeat interval).
- Docker assets: multi-stage `Dockerfile`, `.dockerignore`, `docker-compose.yml` with persistent volume for overrides.
- GitHub Actions workflow (`.github/workflows/docker-publish.yml`) for automatic multi-arch (amd64+arm64) build & push on branch and tag (`v*`).
- OCI metadata labels and build argument (`VERSION`) in Docker image.
- Version + (placeholder) Docker pulls badges in README header.
- VidSrc extractor refactor: removed direct `process.exit` calls; `main()` now returns status code (safer when required as a module).

### Changed
- Config normalization now clears legacy single `tmdbApiKey` when `tmdbApiKeys` override is explicitly emptied.
- Dockerfile slimmed: narrowed COPY set, added labels, build arg, retained only necessary runtime artifacts.
- `.dockerignore` expanded to reduce build context (`.git`, logs, markdown except README, tests, CI configs, caches, compose file, etc.).

### Removed
- Deprecated `uhdmovies` provider: code file, registry references, UI toggles, documentation mentions.

### Security
- Hardened auth flow: session cookies (HttpOnly), no-store headers for admin pages, escalating lockouts against brute force.

### CI / Automation
- Added multi-arch Docker publish workflow using Buildx & QEMU.

### Documentation
- Added Docker usage section (local build, compose, multi-key usage, env vars table, healthcheck notes).
- Added screenshots gallery of admin UI.
- Updated docs to reflect provider removal and new configuration semantics.
- Added this `CHANGELOG.md`.

### Developer Experience
- Heartbeat diagnostic interval to aid investigation of unexpected exits.
- Intercepted premature `process.exit` calls to avoid silent shutdowns during debugging.

## Historical Context
This 1.0.0 release consolidates modernization work: provider cleanup, configuration clarity, deployment ergonomics (Docker + CI), security hardening, and observability.

---

[1.0.0]: https://github.com/Inside4ndroid/TMDB-Embed-API/releases/v1.0.0
