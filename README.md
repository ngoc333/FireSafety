# FireSafety

Mobile-first React + TypeScript + IndexedDB (Dexie) PWA, rewritten from `ngoc333/MobileApps/apps/DangerZoneScan`.

## What works in the frontend

- Employee sign-in (LAN API; or Supabase Auth email/password in Internet deployment)
- Cached employee profile for returning to an already used device when offline
- Device QR scan (BarcodeDetector where supported) + manual code fallback
- Offline master data, schedule, checklist OK/NO OK, mandatory countermeasure and due date for NO OK
- Text-only repair completion; no report, before, defect or after photographs
- Local-first transactional IndexedDB writes and durable outbox event UUID
- Automatic sync on open, reconnect, visibility/focus and every 30 seconds while app is open
- Separate LAN and Internet health probes; visible network and pending indicators
- Minimal bottom navigation for Check / Schedule / Repair / History

The app is a working **frontend scaffold**. Integration with the production network requires endpoints and SQL contracts below. No real employee data or test fixtures are bundled.

## Run

```sh
npm install
cp .env.example .env.local
npm run dev
npm run build
```

### API routing

- `localhost`, `127.0.0.1`, `::1`: choose `VITE_DEPLOY_TARGET=lan` or `internet` in `.env.local`, then restart Vite.
- `*.dskorea.com` and private IPv4 addresses (`10/8`, `172.16/12`, `192.168/16`): LAN API.
- Other hostnames (including `*.vercel.app`): Supabase.
- Routing is selected **once by the website hostname**; an unreachable configured backend means offline. **Never silently fail over to the other backend.** Hostnames are not a security boundary.

For LAN, configure `VITE_LAN_API_BASE`. For Supabase, set `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY` and deploy the required backend components before attempting integration. Internet/Supabase remains a scaffold, not yet an accepted release.

### IndexedDB scoping

The metadata store is `FireSafety_identity_<target>`, and business data/outbox are `FireSafety_<target>_<employeeId>`, so even on the same `localhost` origin LAN and Supabase cannot share cached records. Signing out retains unsent events in that employee's database for later login. The older unscoped `FireSafety` IndexedDB is intentionally **not auto-migrated**: its original environment/employee cannot be verified, so review any pending data there before relying on the new version.

**Do not ship internal credentials to browsers.** Vite environment variables are public by design. Never put PostgreSQL credentials, service role keys or shared RSM tokens here.

## LAN adapter (work in progress)

The branch-local Node 22 adapter at `server/lan-api.mjs` reuses existing Oracle Gateway and RSM Gateway **without exposing service credentials to React**. It is a LAN-only implementation scaffold, not a verified production integration.

To try it with access to the internal gateways:

```sh
cp server/config.example.env .env.lan
# Set the internal URLs and server-only credentials in .env.lan
npm run dev:api
# In another terminal (with .env.local using VITE_LAN_API_BASE=/api/fire-safety):
npm run dev
```

Vite proxies API calls to the Node adapter. Use a single internal HTTPS origin for production, configure the trusted proxy, TLS and session secret. All secrets live in server environment variables. `GET /bootstrap` calls the single PostgreSQL master function `rsm.dz_web_get_master` for checklist items, codes, countermeasures, equipment, locations and the server-controlled schedule window. Master cursors use `update_date`; schedules are replaced as one ±7-day cache. Open repairs still use the existing read function. The PostgreSQL migration is in `server/sql/001_dz_web_master_sync.sql` and must be reviewed/run by an authorized database operator. `POST /events` deliberately returns **501** until the real PostgreSQL functions support atomic event-UUID deduplication. This ensures pending offline writes are never falsely acknowledged. The history import is also not completed. See server source and `docs/PLAN.md`.

## LAN gateway contract

The LAN API must enforce authenticated user authorization and CORS origin policy. The frontend expects:

- `POST /login` body `{employeeId}`, returns `{profile,accessToken?}`. LAN deployment must be restricted to trusted access or use stronger user authentication if exposed beyond LAN.
- `GET /health` returns HTTP 200 (CORS enabled, allow preflight when applicable).
- `GET /bootstrap?employeeId=...` returns `BootstrapData` in `src/types.ts`; optional master cursor query parameters are `checklist_item`, `code`, `countermeasure_item`, `equipment` and `location`. The server derives/validates the authorized employee identity; ignore spoofed employeeId.
- `POST /events` receives an `OutboxEvent`, returns `{success:true}` only **after** a durable, idempotent database commit keyed by event UUID.

The existing Android app uses PostgreSQL functions `fn_dz_scan_get_master_checklists`, `fn_dz_scan_get_locations`, `fn_dz_scan_get_master_countermeasures`, `fn_dz_scan_get_schedule`, `fn_dz_scan_get_results`, `fn_dz_scan_get_open_repairs`, `fn_dz_scan_save_inspection` and image-based repair functions. The LAN gateway must adapt these functions; this repository does not claim those server endpoints already exist.

## Offline and sync guarantees

IndexedDB commits local inspection / completion and outbox atomically. Sync is automatic while the PWA is OPEN; mobile browsers may suspend background execution. An event is only removed after server confirmation, with retry on transient errors. Both server endpoints must enforce UUID idempotency. If the browser storage is cleared before upload, unsent local data is lost; users must not use private/incognito browsing for field inspections. Provision offline device data during first online launch.

Sync is deliberately single-active-run. Bootstrap is downloaded after pending events have been acknowledged to avoid overwriting edits. Master rows use per-table server cursors and transactional delta upserts; schedule rows are replaced only after the complete server window is received.

## Security and deployment notes

- PWA install, camera and service workers require a secure origin: HTTPS (or localhost during development). Use a company-trusted TLS certificate and hostname in the LAN.
- Hosting the PWA on Vercel does NOT grant access to private LAN API endpoints. Use Supabase in Internet mode; the trusted C# worker bridges it to internal PostgreSQL.
- Browser CORS, mixed content and private network restrictions must be accounted for; use dedicated builds with different environment variables.
- A simple numeric employee ID is not secure Internet authentication. Internet mode uses Supabase Auth with company-provisioned email/password; map each identity to an employee in `fs_profiles`.
- Deploy `supabase/schema.sql` with RLS, then Edge Function `firesafety` with JWT verification. The worker's service-role key belongs only on the trusted internal server.
- Legacy reporting images may still appear in existing historical data in PostgreSQL. The new PWA intentionally ignores them.

## What still needs integration work

1. Implement the LAN gateway against actual internal functions; current frontend cannot query private PostgreSQL directly.
2. Set up Supabase Auth employees and user-scoped master data; deploy Edge Function.
3. Implement the internal worker's SQL contracts described in `worker/README.md`, including idempotent photo-free repair and employee mapping.
4. Validate device camera QR support (fallback provided), offline installation, reconnect, repeated event delivery, access control and cross-device consistency.
5. Confirm desired treatment for unplanned (no ±7-day schedule) inspections and existing history imports.

The Android source app remains unchanged. This rewrite intentionally avoids Clean Architecture layers, generic repository patterns, CQRS, and unnecessary abstraction.
