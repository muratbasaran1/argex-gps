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

## Installation & Running
1. Clone the repository: `git clone https://github.com/your-org/argex-gps.git && cd argex-gps`.
2. Install dependencies per package:
   - **Admin panel**: `cd admin && npm install`
   - **Server/API**: `cd server && npm install` (or `docker compose build` if containerized)
   - **Mobile app**: `cd mobile && npm install` (for React Native/Expo) or `flutter pub get` (for Flutter)
3. Start backend services:
   - With Docker: `cd server && docker compose up -d` (API, database, tile storage)
   - Without Docker: `cd server && npm run dev` (ensure Postgres/Redis from `.env` are running)
4. Run the admin panel: `cd admin && npm run dev` and visit the indicated localhost port.
5. Launch the mobile/client app with your chosen toolchain (e.g., `cd mobile && expo start` or `flutter run`).

These steps will evolve as the codebase grows; see upcoming documentation updates for precise commands.

## Map data packages
- Admins can upload prepared map tile archives to the backend storage directory defined by `MAP_STORAGE_PATH` in `server/.env`.
- Developers can download packaged regions from an internal bucket or CDN, place them under `server/data/map-packages`, and rebuild the tile index if needed.
- For mobile testing, sideload a `.tgz`/`.zip` package into the path configured by `MAP_PACKAGE_DIR` in `mobile/.env` or trigger a download from the admin API endpoint (e.g., `/maps/:regionId/download`).

## Sync test flow (example)
1. Start the backend services (`docker compose up` or `npm run dev` in `server`).
2. Run the admin panel (`npm run dev` in `admin`) and create a test user plus a sample map package.
3. Launch the mobile app, sign in with the test user, and download the sample region while online.
4. Switch the device to airplane mode, create a waypoint/track, and confirm it is stored locally.
5. Restore connectivity and trigger a manual sync; verify the new waypoint appears in the admin panel and server logs.

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
