# FireSafety - Plan & Checklist (Agent handoff)

> Working status for **all agents and conversations**. Read `AGENTS.md` and `docs/PROJECT.md` first. **Check the current branch/code before acting**; a checked box is not proof of an end-to-end working feature.

## Current handoff

- **Default/stable:** `main` (contains the agent harness; feature code is not promoted until tested).
- **Active development branch:** `local` (LAN + internal PostgreSQL). **Internet:** deferred.
- **Current focus:** validate the new read-only LAN adapter against real Oracle/RSM responses; then confirm atomic PostgreSQL idempotent write functions.
- **Last completed:** existing frontend foundation and hostname/IndexedDB isolation; implemented read-only LAN Node gateway and RSM row mapping on `local` (commits `d65a3ec8`, `81352f5e`, `07e44a64`). Mock Oracle/RSM integration test, mapping tests, `npm test` and React build **passed** (GitHub Actions `42743749875`). This does not prove a real LAN database connection.
- **Known blockers:** PostgreSQL function definitions/permissions and live RSM/Oracle response envelopes not verified; LAN adapter is not yet deployed. No atomic event UUID deduplication or photo-free repair write function is confirmed, so `/events` deliberately returns HTTP 501 and IndexedDB keeps pending writes. Unscoped legacy `FireSafety` IndexedDB is not auto-migrated.
- **Not yet verified:** real LAN authentication/data access, full inspection/repair flow, physical phone QR, PWA offline/reconnect, event retry/idempotency, on-device multi-user cache isolation, or cloud synchronization.
- **Next task (one):** run the LAN adapter with authorized access to the real Oracle/RSM Gateway, capture **redacted example responses and SQL function signatures** (especially save-inspection and photo-free repair), then design an atomic event UUID acknowledgment before enabling `/events`.
- **Last documentation update:** 2026-11-10 (read-only LAN adapter, mocked verification and integration blockers).

## Roadmap & checklist

Legend: `[x]` means the stated artifact/action is **verified**; `[ ]` means still to do. A **scaffold** is not a production-ready feature.

### Phase 1 - Minimal Agent Harness

- [x] Create `AGENTS.md` and `docs/PROJECT.md` (documented rules and project decisions).
- [x] Adopt 3 **active** branches: `main` stable, `local` LAN development, `internet` cloud development; use direct commits to development branches.
- [x] Create `docs/PLAN.md` with handoff, roadmap, task statuses and test gate.
- [ ] Optional cleanup: remove unused legacy `feat/offline-first-pwa` branch **after confirming it is no longer needed**; not a blocker.

### Phase 2 - Internal PostgreSQL & LAN API (current)

- [ ] Verify the real read/write functions, returned columns, employee identity and server-side permissions; document only the actual contracts.
- [ ] Agree the common API semantics: RSM gateway response wrappers vs Supabase RPC, identity scope, input/output mapping and unambiguous write acknowledgments.
- [x] Build the smallest LAN adapter **read-only foundation**: Oracle employee login, signed cookie, health, employee-scoped bootstrap, RSM read mapping, and mocked end-to-end test. No production verification yet.
- [ ] Implement and verify the remaining durable, idempotent `/events` submission; currently responds HTTP 501.
- [x] Implement/test mapping for locations, checklist items, countermeasures, schedules and open repairs against sample RSM-shaped rows.
- [ ] Verify mapping against real RSM output; implement server-side inspection history/results in React API contract.
- [ ] Support `NO OK` with countermeasure/due date and photo-free repair completion; adjust database contract **without inventing** existing functions.
- [ ] Add idempotent event handling (unique event UUID), explicit acknowledgments and actionable failure messages.

### Phase 3 - Mobile PWA & offline behavior

- [x] Initial React + TypeScript mobile-first PWA UI and QR/manual-input interface **scaffold exists**.
- [x] Initial IndexedDB/Dexie, local save and automatic outbox sync **scaffold exists**.
- [x] Hostname-based backend selection, localhost `.env.local` override, separate IndexedDB by environment and employee **implemented**. Native Node routing tests and frontend build passed on `local`; not yet verified against running servers.
- [ ] Verify login/offline reopening and strict separation of employee data on the same device.
- [ ] Verify full inspection, schedule (existing ±7-day rule), history and repair journeys without any reporting/before/after photos.
- [ ] Verify first online provisioning, PWA install, HTTPS and QR camera on real phones (manual QR entry remains available).
- [ ] Test network loss/recovery, LAN-only vs Internet-only connectivity, queued writes after app restart and automatic retry.
- [ ] Test server acknowledgement, repeated delivery without duplicates and preservation of failed/pending data.

### Phase 4 - LAN verification & promotion to main

- [ ] End-to-end testing against **real internal PostgreSQL** with authorized employee accounts.
- [ ] Check access control, incorrect/expired sessions, multi-user isolation, error handling and offline recovery.
- [ ] Record actual test evidence and outstanding limitations; obtain acceptance of the LAN workflow.
- [ ] Merge only verified/accepted changes into `main`; do not promote unverified cloud or backend scaffolding as working functionality.

### Phase 5 - Internet (deferred until LAN acceptance)

- [ ] Implement and test Supabase Auth, PostgreSQL tables and RLS with real authorization rules.
- [ ] Implement and verify the C# Worker bridge (deduplication, retry, conflicts, repair updates and data ownership).
- [ ] Deploy Internet build on Vercel, test PWA offline/online and cross-environment data flows.
- [ ] Accept the Internet behavior, then merge only verified changes into `main`.

## Required verification before merging into main

For the completed scope only: **build passes**, relevant logic/API tests pass, server writes are idempotent, offline data remains intact, and the affected real-device/LAN/cloud flows have been demonstrated where applicable. A green build alone never satisfies LAN/Internet acceptance. A partially completed milestone stays on its development branch.

## Agent handoff rule

At the end of a meaningful task, update **this file in the same commit or work session**:

1. Check only tasks backed by real evidence; distinguish `scaffold`, `build passed`, `tested on device` and `production verified`.
2. Keep **Current handoff** current: active branch, focus, last completed with **commit/test evidence**, blockers, and one next task.
3. Preserve open/failed tasks; never mark them done because code compiles or because a plan says they should.
4. Do not create more status files, task managers or engineering layers. This file is the single progress/checklist source of truth.

## Commits / verification notes

- Prior frontend baseline on `local` and `internet`: `af5eb95b` — GitHub Actions `npm run build` **passed** on both branches. Not an end-to-end validation.
- 2026-11-10: `4a9fc71a` on `local` and `internet`: hostname routing, scoped IndexedDB, built-in Node unit tests. Local GitHub Actions run `42738435845` passed tests and build; Internet branch workflow triggered separately. Real-world testing remains open.
- 2026-11-10: harness updated for `main`/`local`/`internet` with this shared plan. Harness text was checked against repository contents; no app/API behavior changed.
- 2026-11-10: `local` commits `d65a3ec8`, `81352f5e`, `07e44a64`: LAN RSM adapter/read-only API, Vite proxy, mocked API/mapping tests; [GitHub Actions run 42743749875](https://github.com/ngoc333/FireSafety/actions/runs/42743749875) passed test/build. No live LAN testing; no write ACK until real PostgreSQL atomic contract exists.
