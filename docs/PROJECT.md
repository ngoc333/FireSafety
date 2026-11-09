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

## Backend and rollout sequence

1. **Now: LAN first.** The React build for LAN talks to a **server-side LAN API**, which reads/writes the internal PostgreSQL database. Do not connect the browser to PostgreSQL directly.
2. Run and verify the LAN inspection / repair / schedules / history flow, offline persistence, retries and security before proceeding.
3. **Later (only on request):** Internet build on Vercel, authenticated Supabase backend, and a trusted C# worker exchanging data between internal PostgreSQL and Supabase.

Use one frontend codebase with environment-specific builds; do not create separate React apps. Supabase/worker starter files already present on the PWA branch are *scaffolding*, not proof that cloud integrations are deployed or working. Leave them alone during LAN-first work unless a narrow change is needed.

## Source facts and integration boundary

The Android reference calls PostgreSQL/RSM functions including:

- Read: `fn_dz_scan_get_master_checklists`, `fn_dz_scan_get_locations`, `fn_dz_scan_get_master_countermeasures`, `fn_dz_scan_get_schedule`, `fn_dz_scan_get_results`, `fn_dz_scan_get_open_repairs`.
- Write: `fn_dz_scan_save_inspection` (checklist); `fn_dz_scan_save_item_images` (currently image-based corrections).

Those names are **observed calls in the source**, not a verified specification of the server-side SQL definitions. Photo-free repair handling and the LAN API still need actual PostgreSQL contract verification and implementation. Do not assume a production repair-without-image function already exists.

The initial PWA branch uses these *proposed* LAN routes: `POST /login`, `GET /health`, `GET /bootstrap`, `POST /events`. Treat these as frontend integration requirements to reconcile with the real server, **not endpoints already deployed**.

## Current repository layout and status

- `main`: README and this two-file agent harness only.
- `feat/offline-first-pwa`: initial React/TypeScript mobile UI, Dexie IndexedDB, auto-sync outbox, PWA, and Supabase/worker scaffolding. Draft PR #1 is not production approval.
- `src/`: React UI and client data/synchronization modules.
- `supabase/`: future Internet-side schema/function scaffold.
- `worker/`: future internal-to-cloud C# worker scaffold.

**Not yet proven working in the factory:** authenticated LAN API integration, production SQL changes for photo-free repairs, full cross-device sync semantics, mobile QR/browser compatibility, first-load provisioning, and real offline/reconnect behavior. Always report these limitations until actually verified.

## Agent decision rule

For each request: check this document and the relevant code, implement only the requested slice, run the available checks, and report verified results vs open items. Prefer a small, easy-to-review change to a generalized system.
