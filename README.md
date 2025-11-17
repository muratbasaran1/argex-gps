# Argex GPS

Argex GPS is an offline-first, Gaia GPS–style navigation and mapping experience tailored for adventurers who need reliable maps without a constant data connection. The project also includes an admin panel for managing map packages, user access, and telemetry.

## Architecture Overview
- **Mobile/Client App**: Offline-capable navigation UI with map downloads, waypoint management, and trip tracking.
- **Sync & Storage**: Local SQLite/Realm-style datastore with background sync to the server when connectivity is available.
- **Server/API**: REST/GraphQL API for map package delivery, trip backups, user management, and admin controls.
- **Admin Panel**: Web dashboard to upload map tiles, approve user roles, and review usage/telemetry.
- **Mapping Pipeline**: Tools to ingest, tile, and package map datasets for offline delivery.

## Prerequisites
- Modern Node.js LTS and npm/yarn for the admin panel and tooling.
- A recent mobile toolchain (e.g., React Native/Expo or Flutter SDK) for the client app.
- Docker and Docker Compose for local server/API and database orchestration.
- Git for version control.

## Environment templates
Copy the example environment files to `.env` and update values for your stack. The `*.example` files are templates only; Docker
Compose uses your real `.env` copies (for example, `server/.env`) at runtime:
- `cp admin/.env.example admin/.env`
- `cp server/.env.example server/.env`
- `cp mobile/.env.example mobile/.env`

Each template now ships with placeholder values for API URLs, database connections, JWT/OIDC wiring, map package paths, and the keys surfaced in the one-page settings screen. Swap the example hostnames (`api.example.com`, `auth.example.com`, `downloads.example.com`) with the endpoints for your deployment.

### Critical variables and how the settings page uses them
- **admin/.env**
  - **API endpoints**: `VITE_API_BASE_URL`, `VITE_API_WEBSOCKET_URL`, `VITE_TILE_CDN_URL`, `VITE_MAP_PACKAGE_BASE_URL`, and `VITE_MAP_PACKAGE_INDEX_URL` populate the settings form so the admin UI talks to the right HTTP, websocket, and tile/map download hosts.
  - **Auth**: `VITE_AUTH_DOMAIN`, `VITE_AUTH_CLIENT_ID`, `VITE_AUTH_AUDIENCE`, `VITE_AUTH_SCOPE`, `VITE_AUTH_REDIRECT_URI`, and `VITE_AUTH_POST_LOGOUT_REDIRECT_URI` configure the OIDC login flow the settings screen exposes to administrators.
  - **UI defaults**: `VITE_SETTINGS_DEFAULT_MAP_STYLE` and `VITE_SETTINGS_FEATURE_FLAGS` let the single settings page toggle UI options (e.g., map style or feature switches) without hard-coding them.
- **server/.env**
  - **API publicity**: `PUBLIC_API_URL`, `API_BASE_URL`, `API_WEBSOCKET_URL`, and `TILE_CDN_URL` define the URLs returned to clients and echoed back in the settings UI.
  - **Database**: `DATABASE_URL` and `DATABASE_SCHEMA` document how the API reaches MySQL. These values appear in the admin settings page so operators can verify connectivity quickly.
  - **Auth/JWT**: `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`, and `OIDC_JWT_SECRET` are the variables the auth middleware reads. For RS256 tokens, supply your issuer plus a `OIDC_JWKS_URL` (or discovery URL) so the server can fetch and rotate signing keys. For HS256 tokens, provide a long, random `OIDC_JWT_SECRET` you control end-to-end (32+ characters) and avoid sharing it with untrusted systems. `AUTH_DOMAIN`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, and `OIDC_DISCOVERY_URL` remain available for IdP integrations exposed in the settings page.
  - **CORS**: `ALLOWED_ORIGINS` lists comma-separated client origins permitted to call the API. For local admin/mobile testing, set `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000` so both dev servers can reach the backend without extra configuration.
  - **Map packages**: `MAP_STORAGE_PATH`, `MAP_ARCHIVE_PATH`, `MAP_ARCHIVE_MOUNT`, `MAP_PROVIDER_TOKEN`, `MAP_PACKAGE_INDEX_PATH`, and `MAP_PACKAGE_DOWNLOAD_URL` tell the API where to read/write archives; the settings view references these to explain where uploads land.
  - **Settings defaults**: `SETTINGS_DEFAULT_REGION`, `SETTINGS_DEFAULT_MAP_STYLE`, and `SETTINGS_FEATURE_FLAGS` feed the single-page settings UI with initial values shared between admin and mobile clients.
- **mobile/.env**
  - **API endpoints**: `API_BASE_URL`, `API_WEBSOCKET_URL`, `PUBLIC_API_URL`, and `TILE_CDN_URL` prefill the device settings screen so the app can reach the server and tiles.
  - **Auth**: `AUTH_DOMAIN`, `AUTH_CLIENT_ID`, `AUTH_AUDIENCE`, and `AUTH_SCOPE` mirror the same tenant configured on the server and surface in the settings page for quick validation.
  - **Offline map storage**: `MAP_PACKAGE_DIR`, `MAP_PACKAGE_ARCHIVE`, `MAP_PACKAGE_INDEX_URL`, and `MAP_PACKAGE_DOWNLOAD_URL` drive how the client lists and downloads map regions, all editable from the single settings page.
  - **Settings defaults**: `SETTINGS_DEFAULT_REGION` and `SETTINGS_DEFAULT_MAP_STYLE` control the initial selections shown to end users.

## Installation & Running
1. Clone the repository: `git clone https://github.com/your-org/argex-gps.git && cd argex-gps`.
2. Copy environment templates as shown above and adjust secrets/URLs.
3. (Optional) Install dependencies locally per package if you want to run outside Docker:
   - **Admin panel**: `cd admin && npm install`
   - **Server/API**: `cd server && npm install`
   - **Mobile app**: `cd mobile && npm install` (React Native/Expo) or `flutter pub get` (Flutter)
4. Start backend stack with Docker Compose from the repo root:
   - `docker compose up -d mysql` to boot MySQL.
   - `docker compose up -d api` to run the API with mounted source and map volumes. This binds the API to port `4000`, matching `PUBLIC_API_URL`, `VITE_API_BASE_URL`, and `API_BASE_URL` in the example env files. The API will reach MySQL on `mysql:3306` using the credentials and URLs you define in `server/.env` (copied from `server/.env.example`).
   - Tail logs as needed: `docker compose logs -f api`
5. Alternatively, run the server locally without Docker: `cd server && npm run dev` (ensure MySQL from `.env` is running).
6. Run the admin panel: `cd admin && npm run dev` and visit the indicated localhost port.
7. Launch the mobile/client app with your chosen toolchain (e.g., `cd mobile && expo start` or `flutter run`).

These steps will evolve as the codebase grows; see upcoming documentation updates for precise commands.

## Map data packages
- Admins can upload prepared map tile archives to the backend storage directory defined by `MAP_STORAGE_PATH` in `server/.env` (defaults to `/var/lib/argex-gps/map-packages`, mounted from the `map-packages` volume in Docker).
- Developers can download packaged regions from an internal bucket or CDN, place them under `./map-packages` (repo root) so they sync into the server container, and rebuild the tile index if needed.
- For mobile testing, sideload a `.tgz`/`.zip` package into the path configured by `MAP_PACKAGE_DIR` or `MAP_PACKAGE_ARCHIVE` in `mobile/.env`, or trigger a download from the admin API endpoint (e.g., `/maps/:regionId/download`).
- Example layout for the server and mobile offline directories:
  ```
  map-packages/
    regions/
      west-coast-v1/
        metadata.json
        tiles/
          12/
            654/1584.pbf
    archives/
      west-coast-v1.tgz
  ```

## Sync test flow (example)
1. Start dependencies: `docker compose up -d mysql`.
2. Start the API: `docker compose up -d api` and wait for migrations/startup logs.
3. Run the admin panel (`npm run dev` in `admin`) and create a test user plus a sample map package upload.
4. Verify map packages are visible under `/var/lib/argex-gps/map-packages` inside the `api` container: `docker compose exec api ls /var/lib/argex-gps/map-packages`.
5. Launch the mobile app, point `API_BASE_URL` to your machine IP, and download the sample region while online.
6. Switch the device to airplane mode, create a waypoint/track, and confirm it is stored locally.
7. Restore connectivity and trigger a manual sync; verify the new waypoint appears in the admin panel and server logs.

## Contribution Guidelines
- Use feature branches and open pull requests with clear descriptions.
- Add tests and run format/lint/type checks before submitting to catch errors early.
- Keep documentation updated (README, architecture notes, API contracts) alongside code changes.
- Follow conventional commit messages where possible.
- Report issues with reproducible steps and expected vs. actual behavior.

## Roadmap & Planned Features
- Offline map downloads with regional packaging and resumable transfers.
- Turn-by-turn navigation with waypoint routing and elevation profiles.
- Trip recording with GPX export/import and cloud backup when online.
- Admin panel improvements: role-based access control, telemetry dashboards, and map asset lifecycle tools.
- Advanced mapping pipeline: automated tiling, versioned map packages, and integrity checks.
- Offline search and POI discovery.
- Multi-platform support (iOS/Android/Web) with consistent UX.

## Licensing & Documentation
- **License**: See the [LICENSE](./LICENSE) file for terms.
- **Documentation**: Future detailed docs (API references, deployment guides, and ops runbooks) will live in a `/docs` directory once available.
