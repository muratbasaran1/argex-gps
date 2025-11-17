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
Copy the example environment files to `.env` and update values for your local setup:
- `cp admin/.env.example admin/.env`
- `cp server/.env.example server/.env`
- `cp mobile/.env.example mobile/.env`

Each template includes placeholders for API URLs, database/cache connections, auth/JWT wiring, and map package paths so you can align all three apps with the same stack.

### Quick-start values
The `.env.example` files are pre-filled to match the default Docker Compose topology:
- API endpoints point at `http://api.argex-gps.localtest.me:4000` (`ws://` for websockets) so they align with the `api` service’s published port.
- Database/Redis URLs target the Compose services `db` and `redis` with the shipped credentials (`postgres://argex:argex@db:5432/argex_gps` and `redis://redis:6379`).
- Auth/JWT placeholders share the same issuer/audience (`argex-gps-api`) across admin, mobile, and server—replace the `*_CLIENT_ID`/`*_SECRET` entries and `JWT_SECRET` with real values from your IdP.
- Map package paths default to the mounted volumes (`/var/lib/argex-gps/map-packages` inside the API container and `./map-packages/…` on the host) so uploaded archives and region folders are discoverable by all packages.

### Critical variables to review
- **API endpoints**: `VITE_API_BASE_URL`, `API_BASE_URL`, `API_WEBSOCKET_URL`, `PUBLIC_API_URL`, and `TILE_CDN_URL` should all point to the URL/port where you expose the API and tiles (the defaults line up with `docker compose` mapping port `4000`).
- **Database/cache**: `DATABASE_URL`, `DATABASE_SCHEMA`, `REDIS_URL`, and `REDIS_TLS_URL` declare how the API connects to Postgres/Redis. Defaults assume the Compose services `db` and `redis` and no TLS locally.
- **Auth/JWT**: `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `OIDC_DISCOVERY_URL`, plus the client-side `VITE_AUTH_*` and `AUTH_*` values must all reference the same identity provider/tenant.
- **Map packages**: `MAP_STORAGE_PATH`, `MAP_ARCHIVE_PATH`, `MAP_PACKAGE_DIR`, `MAP_PACKAGE_ARCHIVE`, `MAP_ARCHIVE_MOUNT`, `MAP_PROVIDER_TOKEN`, `MAP_PACKAGE_INDEX_PATH`, and `VITE_MAP_PACKAGE_INDEX_URL` define where map packages live on disk or via CDN for the server, admin panel, and mobile app.
- **Copy tips**: keep API hostnames consistent across files so websockets and tile URLs resolve, reuse the same `JWT_*` issuer/audience everywhere, and point map storage variables to directories shared with Docker volumes (`./map-packages` on the host, `/var/lib/argex-gps/map-packages` in the API container).

### Critical variables by file
- **admin/.env**: API endpoints (`VITE_API_BASE_URL`, `VITE_API_WEBSOCKET_URL`, `VITE_TILE_CDN_URL`, `VITE_MAP_PACKAGE_INDEX_URL`) should track the same host/port as the server; `VITE_MAP_PACKAGE_BASE_URL` points to the map download route. Auth settings (`VITE_AUTH_DOMAIN`, `VITE_AUTH_CLIENT_ID`, `VITE_AUTH_AUDIENCE`, `VITE_AUTH_SCOPE`, `VITE_AUTH_REDIRECT_URI`, `VITE_AUTH_POST_LOGOUT_REDIRECT_URI`) must mirror the issuer/audience configured on the server.
- **server/.env**: The API listens on `PORT` and advertises `PUBLIC_API_URL`/`API_BASE_URL`/`API_WEBSOCKET_URL` to clients. Database/cache connectivity lives in `DATABASE_URL`, `DATABASE_SCHEMA`, `REDIS_URL`, and `REDIS_TLS_URL`. JWT/OIDC settings (`JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `OIDC_DISCOVERY_URL`, `AUTH_DOMAIN`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`) define token validation for both server and clients. Map storage uses `MAP_STORAGE_PATH`, `MAP_ARCHIVE_PATH`, `MAP_ARCHIVE_MOUNT`, `MAP_PROVIDER_TOKEN`, and `MAP_PACKAGE_INDEX_PATH` to locate packaged tiles and their index.
- **mobile/.env**: API endpoints (`API_BASE_URL`, `API_WEBSOCKET_URL`, `PUBLIC_API_URL`, `TILE_CDN_URL`) must match the server hostname/IP accessible from the device or emulator. Auth entries (`AUTH_DOMAIN`, `AUTH_CLIENT_ID`, `AUTH_AUDIENCE`, `AUTH_SCOPE`) should align with the same IdP tenant as the admin/server. Offline map paths (`MAP_PACKAGE_DIR`, `MAP_PACKAGE_ARCHIVE`, `MAP_PACKAGE_INDEX_URL`, `MAP_PACKAGE_DOWNLOAD_URL`) control where packages are stored locally and where downloads are fetched.

These examples deliberately use loopback/CNAME-friendly hostnames (e.g., `api.argex-gps.localtest.me`) to mirror the compose setup while avoiding collisions with real production domains.

## Installation & Running
1. Clone the repository: `git clone https://github.com/your-org/argex-gps.git && cd argex-gps`.
2. Copy environment templates as shown above and adjust secrets/URLs.
3. (Optional) Install dependencies locally per package if you want to run outside Docker:
   - **Admin panel**: `cd admin && npm install`
   - **Server/API**: `cd server && npm install`
   - **Mobile app**: `cd mobile && npm install` (React Native/Expo) or `flutter pub get` (Flutter)
4. Start backend stack with Docker Compose from the repo root:
   - `docker compose up -d db redis` to boot dependencies.
   - `docker compose up -d api` to run the API with mounted source and map volumes. This binds the API to port `4000`, matching `PUBLIC_API_URL`, `VITE_API_BASE_URL`, and `API_BASE_URL` in the example env files.
   - Tail logs as needed: `docker compose logs -f api`
5. Alternatively, run the server locally without Docker: `cd server && npm run dev` (ensure Postgres/Redis from `.env` are running).
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
1. Start dependencies: `docker compose up -d db redis`.
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
