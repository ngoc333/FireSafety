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

- `localhost`, `127.0.0.1`, `::1`: LAN API.
- `*.dskorea.com` and private IPv4 addresses (`10/8`, `172.16/12`, `192.168/16`): LAN API.
- Other hostnames (including `*.vercel.app`): Supabase.
- Routing is selected **once by the website hostname**; an unreachable configured backend means offline. **Never silently fail over to the other backend.** Hostnames are not a security boundary.

For LAN, the browser calls the fixed RSM API `https://172.30.10.124:5179` directly. The API must allow the PWA origin through CORS and its HTTPS certificate must be trusted by the device. For Supabase, set `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY`. Internet/Supabase remains a scaffold, not yet an accepted release.

### IndexedDB scoping

The metadata store is `FireSafety_identity_<target>`, and business data/outbox are `FireSafety_<target>_<employeeId>`, so even on the same `localhost` origin LAN and Supabase cannot share cached records. Signing out retains unsent events in that employee's database for later login. The older unscoped `FireSafety` IndexedDB is intentionally **not auto-migrated**: its original environment/employee cannot be verified, so review any pending data there before relying on the new version.

**Do not ship internal credentials to browsers.** Vite environment variables are public by design. Never put PostgreSQL credentials, service role keys or shared RSM tokens here.

## Direct LAN API

The browser logs in directly with `POST https://172.30.10.124:5179/api/Auth/login` using `{ empId, password }`, then calls `/api/Db/call` with the Bearer token. The request envelope follows the Android app: `{ name, schema: "rsm", database: null, kind: "function", params }`.

The LAN login password is entered by the user and is not stored in IndexedDB or a `VITE_*` variable. The access token is kept only in the current browser session. The API must provide CORS and a certificate trusted by the device.

The direct LAN client uses `dz_web_get_master` for six master types, `fn_dz_scan_get_open_repairs` for open repairs and `fn_dz_scan_save_inspection` for checklist writes. Photo-free repair completion is intentionally not sent because the source API contract has not confirmed a corresponding function.

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
