# FireSafety - Instructions for AI coding agents

This file is the **agent harness**, not an application framework or a mandate to create more tooling.
Goal: **simple, effective, no overengineering**.

## When starting or resuming a task

1. Read this file, [docs/PROJECT.md](docs/PROJECT.md) and [docs/PLAN.md](docs/PLAN.md) **before coding**, including in a new Agent/session.
2. Check the actual Git branch, current commit and relevant code. Confirm the next unfinished task in PLAN.md; do not assume an old chat or plan status is current.
3. Identify the smallest change that meets the latest user request. If code and documentation disagree, investigate; do not silently guess.
4. Reuse working code. Change PROJECT.md only for confirmed decisions; change PLAN.md when a task, verification result, blocker or next step changes.

## Non-negotiable rules

- **Keep it simple.** Prefer direct, readable TypeScript/C# and a few focused modules. Do not introduce Clean Architecture layers, CQRS, MediatR, generic repositories, custom frameworks, dependency injection containers, event buses, or speculative abstractions.
- **Stay in scope.** Do not refactor unrelated modules, rename the whole project, add speculative features, or create extra docs/scripts/tests just to satisfy a process.
- **Preserve FireSafety business behavior.** Use the existing DangerZoneScan application as the reference. The explicitly agreed change is removing reporting, defect, before-repair and after-repair photo workflows. QR **camera scanning is retained**.
- **Mobile first.** Optimize for one-handed phone use: clear states, large touch targets, minimal steps and unnecessary scrolling.
- **Offline first.** Save business changes locally in IndexedDB, together with durable outbox events, before reporting a successful save. Never discard pending edits on refresh or failed sync.
- **Automatic, safe sync.** Retry when the configured server is reachable; no manual sync button. Delete an outbox item only after a positive server acknowledgment. Require an idempotency key on server writes to prevent duplicates. Avoid overlapping runs and preserve failed records for diagnosis.
- **Know which network works.** Check real LAN API / cloud endpoint reachability instead of relying only on `navigator.onLine`. A device can have Wi-Fi without Internet, or Internet without access to LAN. Do not silently send data to a different environment.
- **Respect PWA limits.** The UI must remain usable offline after initial provisioning. Browsers do not guarantee background sync while the PWA is fully closed; resume when opened/reconnected. PWA install and QR camera require a secure origin.
- **Protect data.** Never put PostgreSQL connection strings, service-role keys, shared service passwords or other secrets in frontend code or `VITE_*` variables. Enforce authentication/authorization on the backend and isolate employee data in the local cache.
- **Do not invent integration details.** Never assume production URLs, table schemas, credentials, stored-procedure contracts, API endpoints, or Supabase mappings exist without verifying them. Clearly mark an unimplemented integration as such.
- **Follow the agreed sequence.** Stabilize the LAN + internal PostgreSQL flow first. Work on Supabase/Vercel/C# cloud synchronization only when explicitly requested after the LAN flow is accepted.

## Git workflow (one developer; 3 long-lived branches)

- `main` is the **stable branch**: merge only a coherent part that has passed relevant tests and whose real-world requirements have been verified. A passing build alone is not approval to merge.
- `local` is the active development branch for LAN API and internal PostgreSQL. **Do LAN first.**
- `internet` is for the future Supabase/Vercel + C# Worker deployment, only after the LAN implementation is accepted.
- Work and commit **directly on the appropriate development branch**. No extra feature branches or pull requests unless explicitly requested.
- Keep commits small and descriptive. When work is verified and accepted, merge into `main` without bringing along unrelated unverified work. Do not force-push or rewrite history.
- Propagate shared fixes deliberately; preserve environment-specific code and configuration.

## Before ending a task (handoff to the next Agent)

1. Build/test only what is relevant (React: usually `npm run build`; focused tests when useful). No new testing framework for the sake of process.
2. Commit the requested change on the correct branch. Do not merge unverified work to `main`.
3. Update **docs/PLAN.md in the same work session**: tick only verified tasks; record what changed, which branch/commit, test result, blockers and the **single next action**. Keep it concise.
4. Report what was actually verified versus what still needs a real device, LAN database or cloud test. Never claim success from source code or a green build alone.
