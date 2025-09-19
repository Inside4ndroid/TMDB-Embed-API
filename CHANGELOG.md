# Changelog

All notable changes to this project will be documented in this file.

## [1.0.5] - 2025-09-19

### Improved
- 4khdhub provider: Permanently block `r2.dev` FSL links (previous optional flag removed).
- Added Referer/Origin headers automatically for FSL Server links during validation (prior to block enforcement ensured proper behavior).
- Tightened URL validation: removed unconditional trust for `r2.dev`; validation logic now consistent across hosts.
- Host distribution instrumentation logs final hostname counts for easier diagnostics.
- Preserved HubCloud worker `.zip` links by stripping the `.zip` extension instead of discarding them (enables direct playback attempts).
- MoviesClub provider: Added automatic `Origin`/`Referer` headers for `vidora.stream` sources to prevent 403 responses.

### Notes
- `r2.dev` links are always removed from final output; no env flag required.

### Documentation
- README: Updated Providers section, unified schema example, MoviesClub listed, registry mapping instructions, and badge version.

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
