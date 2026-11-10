# FireSafety - Plan & Checklist (Agent handoff)

> Working status for **all agents and conversations**. Read `AGENTS.md` and `docs/PROJECT.md` first. **Check the current branch/code before acting**; a checked box is not proof of an end-to-end working feature.

## Current handoff

- **Default/stable:** `main` (contains the agent harness; feature code is not promoted until tested).
- **Active development branch:** `local` (LAN + internal PostgreSQL). **Internet:** deferred.
- **Current focus:** verify existing internal PostgreSQL functions and implement a minimal LAN API compatible with the React client.
- **Last completed:** agent rules and project context created; initial React/PWA/IndexedDB/outbox scaffold written on `local` and `internet`. Frontend `npm run build` passed in GitHub Actions on both development branches before this documentation update.
- **Known blockers:** no verified internal PostgreSQL function definitions/permissions, no implemented LAN API, no agreed photo-free repair write contract.
- **Not yet verified:** real LAN authentication/data access, full inspection/repair flow, physical phone QR, PWA offline/reconnect, event retry/idempotency, multi-user cache isolation, or cloud synchronization.
- **Next task (one):** inspect actual internal PostgreSQL procedures/functions used by DangerZoneScan; agree the minimal LAN API inputs/outputs and photo-free repair update **before writing production SQL**.
- **Last documentation update:** 2026-11-10 (harness/branch workflow).

## Roadmap & checklist

Legend: `[x]` means the stated artifact/action is **verified**; `[ ]` means still to do. A **scaffold** is not a production-ready feature.

### Phase 1 - Minimal Agent Harness

- [x] Create `AGENTS.md` and `docs/PROJECT.md` (documented rules and project decisions).
- [x] Adopt 3 **active** branches: `main` stable, `local` LAN development, `internet` cloud development; use direct commits to development branches.
- [x] Create `docs/PLAN.md` with handoff, roadmap, task statuses and test gate.
- [ ] Optional cleanup: remove unused legacy `feat/offline-first-pwa` branch **after confirming it is no longer needed**; not a blocker.

### Phase 2 - Internal PostgreSQL & LAN API (current)

- [ ] Verify the real read/write functions, returned columns, employee identity and server-side permissions; document only the actual contracts.
- [ ] Implement the smallest secure LAN API needed by the client: health, authenticated login, employee-scoped bootstrap, and durable event submission.
- [ ] Map locations, checklist items, countermeasures, schedules, results and open repairs from PostgreSQL into the React data shapes.
- [ ] Support `NO OK` with countermeasure/due date and photo-free repair completion; adjust database contract **without inventing** existing functions.
- [ ] Add idempotent event handling (unique event UUID), explicit acknowledgments and actionable failure messages.

### Phase 3 - Mobile PWA & offline behavior

- [x] Initial React + TypeScript mobile-first PWA UI and QR/manual-input interface **scaffold exists**.
- [x] Initial IndexedDB/Dexie, local save and automatic outbox sync **scaffold exists**.
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
- 2026-11-10: harness updated for `main`/`local`/`internet` with this shared plan. Harness text was checked against repository contents; no app/API behavior changed.
