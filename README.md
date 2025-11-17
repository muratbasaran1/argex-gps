# Argex GPS

Argex GPS is an offline-first, Gaia GPS–style navigation and mapping experience tailored for adventurers who need reliable maps without a constant data connection. The project also includes an admin panel for managing map packages, user access, and telemetry.

## Architecture Overview
- **Mobile/Client App**: Offline-capable navigation UI with map downloads, waypoint management, and trip tracking.
- **Sync & Storage**: Local SQLite/Realm-style datastore with background sync to the server when connectivity is available.
- **Server/API**: REST/GraphQL API for map package delivery, trip backups, user management, and admin controls.
- **Admin Panel**: Web dashboard to upload map tiles, approve user roles, and review usage/telemetry.
- **Mapping Pipeline**: Tools to ingest, tile, and package map datasets for offline delivery.

## Prerequisites (preliminary)
- Modern Node.js LTS and npm/yarn for the admin panel and tooling.
- A recent mobile toolchain (e.g., React Native/Expo or Flutter SDK) for the client app.
- Docker and Docker Compose for local server/API and database orchestration.
- Git for version control.

## Installation & Running (preliminary)
1. Clone the repository: `git clone https://github.com/your-org/argex-gps.git && cd argex-gps`.
2. Install dependencies for each package (admin panel, server, mobile): `npm install` / `yarn install` / platform equivalents.
3. Copy example environment files (e.g., `.env.example` to `.env`) and fill in API keys, map providers, and database credentials.
4. Start backend services: `docker compose up -d` (API, database, tile storage).
5. Run the admin panel: `npm run dev` (or framework equivalent) and visit the indicated localhost port.
6. Launch the mobile/client app with your chosen toolchain (e.g., `expo start` or `flutter run`).

These steps will evolve as the codebase grows; see upcoming documentation updates for precise commands.

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
