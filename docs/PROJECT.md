# FireSafety - Project context for AI agents

> This file records **confirmed requirements and observable implementation status**, not speculative architecture. Read `AGENTS.md` first.

## Purpose

Rewrite the Android app `DangerZoneScan` into an independent, mobile-first **FireSafety** web application.

- Reference: `ngoc333/MobileApps/apps/DangerZoneScan` (existing .NET MAUI Blazor Android app). Read the source for business behavior instead of guessing.
- Target repository: `ngoc333/FireSafety`.
- Frontend: React + TypeScript, PWA, IndexedDB for local business data.
- Design goal: simple, modern, fast to operate on a phone, avoid unnecessary scrolling and extra steps.
- Guiding engineering criterion: **simple, effective, no overengineering**.

## Confirmed business scope

- Employee login (card number for the internal LAN flow); previously authenticated users need a controlled offline reopening path. Internet authentication must not rely on a public employee ID alone.
- Scan a location/equipment QR using the phone camera; also allow manual equipment/QR code entry.
- Inspection checklist with `OK` / `NO OK`; `NO OK` requires the chosen countermeasure and due date.
- Repair / corrective-action completion using a **text description**, without mandatory photo capture.
- Inspection schedule, completed inspection history and pending repairs.
- Source app resolves inspection schedules in a **±7-day window**. Preserve the existing rule until a different rule is explicitly approved.
- Remove **all photo-reporting workflows**: general report photo, defect/before-fix photo, after-fix photo; remove their required-field validations and upload calls. Do **not** remove QR camera scanning.
- Do not add a manual sync button.

## Offline and synchronization decisions

- IndexedDB is the client persistence layer; write data and its outgoing event atomically before telling the user it was saved.
- Sync runs automatically while the app is open (start, reconnect, focus/visibility, bounded periodic attempts). Retain queued records across failure and app restarts; retries must be safe for duplicate delivery.
- Only delete a queued event after a verified server acknowledgement. The receiving API must implement idempotency by a stable event UUID.
- Never overwrite pending local changes with downloaded server data; clearly surface pending count and connectivity.
- Detect LAN and Internet through **actual endpoint availability**, not just `navigator.onLine`. A build uses its configured backend; network status must not silently change that backend.
- Offline PWA usage requires first successful online installation/provisioning and durable browser storage. Background tasks are not guaranteed after the browser closes. HTTPS (or localhost in development) is required for service worker and camera.

## Shared API and hostname routing (agreed)

- UI calls a **single FireSafety API contract**; only the transport selects LAN or Supabase. Keep business names, function arguments and semantics consistent between internal PostgreSQL and future Supabase functions.
- For `localhost`, `127.0.0.1` or `::1`, `VITE_DEPLOY_TARGET=lan|internet` selects the backend for development. Restart Vite after changing `.env.local`.
- For other hosts, a private IPv4 (`10/8`, `172.16/12`, `192.168/16`) or `dskorea.com` / `*.dskorea.com` uses LAN. All other hostnames (including Vercel) use Supabase. Hostname is a routing hint, **not authentication or proof that a service is private**; revisit the rule if a dskorea.com hostname serves the public app.
- Backend choice is stable for that site load: failed LAN reachability means **offline and retain queued data**, never automatically upload to Supabase; vice versa.
- Read mapping and write acknowledgments differ: the existing RSM gateway wraps PostgreSQL results (e.g. `success`, `rowCount`, `data`), while Supabase RPC exposes `data` and `error`. Normalize and validate them in the API layer, **never in individual UI screens**.
- Do not expose RSM service credentials in React. The LAN path needs a trusted backend/proxy or securely authenticated user-specific gateway; Supabase requires authenticated RPC/RLS with employee authorization. Supabase Edge Functions are optional when RPC can do the job safely.
- Locally stored identity metadata is separated by selected backend; business cache and outbox are separated by **both backend and employee**. Never send events to another account or backend. The earlier unscoped IndexedDB `FireSafety` is not automatically migrated because its event ownership/destination cannot be trusted.
- **Implementation status:** `src/api-target.ts` and account-scoped Dexie selection exist on both development branches. The `local` branch additionally contains the small read-only Node LAN adapter (`server/lan-api.mjs`) calling the existing Oracle and RSM Gateways, `server/rsm-mapping.mjs`, the six-master `dz_web_get_master` contract and PostgreSQL migration script under `server/sql/`; the migration and direct PostgreSQL master checks are verified, while LAN endpoints, SQL writes, device data isolation and authorization remain unverified.

## Backend and rollout sequence

1. **Now: LAN first.** The React build for LAN talks to a **server-side LAN API**, which reads/writes the internal PostgreSQL database. Do not connect the browser to PostgreSQL directly.
2. Run and verify the LAN inspection / repair / schedules / history flow, offline persistence, retries and security before proceeding.
3. **Later (only on request):** Internet build on Vercel, authenticated Supabase backend, and a trusted C# worker exchanging data between internal PostgreSQL and Supabase.

Use one frontend codebase with environment-specific builds; do not create separate React apps. Supabase/worker starter files already present in the development branches are *scaffolding*, not proof that cloud integrations are deployed or working. Leave them alone during LAN-first work unless a narrow change is needed.

## Source facts and integration boundary

The Android reference calls PostgreSQL/RSM functions including:

- Read: `fn_dz_scan_get_master_checklists`, `fn_dz_scan_get_locations`, `fn_dz_scan_get_master_countermeasures`, `fn_dz_scan_get_schedule`, `fn_dz_scan_get_results`, `fn_dz_scan_get_open_repairs`.
- Write: `fn_dz_scan_save_inspection` (checklist); `fn_dz_scan_save_item_images` (currently image-based corrections).

Those names are **observed calls in the source**, not a verified specification of every server-side SQL definition. The web LAN read path now uses the single verified `rsm.dz_web_get_master(p_emp_id, p_type, p_updated_after)` function for `CHECKLIST_ITEM`, `CODE`, `COUNTERMEASURE_ITEM`, `EQUIPMENT`, `LOCATION` and `SCHEDULE`; the migration was applied and checked directly on RSM PostgreSQL. Photo-free repair handling and the LAN API still need gateway/device verification and implementation. Do not assume a production repair-without-image function already exists.

The active `local` branch now implements these routes under `/api/fire-safety`: `POST /login`, `POST /logout`, `GET /health`, `GET /bootstrap`. They use Oracle `SMT_DOWNLOAD` for employee profile and RSM `/api/Db/call` for PostgreSQL reads, with server-side credentials and signed HttpOnly cookies. `GET /health` measures only adapter readiness, **not the actual database**. `POST /events` returns **501 intentionally** until there is a verified atomic, idempotent SQL write (including photo-free repair); never fake success. This is source implementation tested against mocks, **not deployed to LAN**.

`GET /bootstrap` now returns PostgreSQL-shaped master deltas for checklist items, codes, countermeasures, equipment, locations and a server-controlled ±7-day schedule window, plus open repairs. The client stores master rows in six new IndexedDB stores and retains cursors for the five delta-synced tables. Downloading real completed inspection history from `fn_dz_scan_get_results` is **not yet implemented**. The applied migration uses `dz_code.use_yn` and renames `value06` to `use_yn` on the other five master tables. Current LAN sign-in by employee ID matches the existing private Android workflow but is not strong Internet authentication; limit to trusted internal networks and enforce correct authorization server-side.

## Git branches and current implementation

- `main` (default, stable): agreed Agent Harness and documentation; do not interpret development code on other branches as tested or released on `main`.
- `local` (active): initial React + TypeScript mobile-first PWA, IndexedDB/Dexie, automatic-sync outbox and LAN API integration in progress.
- `internet` (deferred): shares the starting frontend; Supabase, Vercel and C# Worker work comes **after** the LAN version is accepted.
- One developer: commit directly to `local` or `internet`, merge **verified and accepted** work into `main`; no new branches or PRs by default.
- The old `feat/offline-first-pwa` branch is legacy and not used for new work; its existence does not change the 3-branch policy.
- `src/`: React UI and client storage/synchronization modules on development branches.
- `supabase/` and `worker/`: future cloud scaffolding, not production integrations.

See [PLAN.md](PLAN.md) for verified status, open items, blockers and the next action.

**Not yet proven working in the factory:** authenticated LAN API integration, production SQL changes for photo-free repairs, full cross-device sync semantics, mobile QR/browser compatibility, first-load provisioning, and real offline/reconnect behavior. Always report these limitations until actually verified.

## Agent decision rule

For each request: check this document and the relevant code, implement only the requested slice, run the available checks, and report verified results vs open items. Prefer a small, easy-to-review change to a generalized system.
