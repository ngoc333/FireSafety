# FireSafety - Instructions for AI coding agents

This file is the **agent harness**, not an application framework or a mandate to create more tooling.
Goal: **simple, effective, no overengineering**.

## Before changing anything

1. Read [docs/PROJECT.md](docs/PROJECT.md) to understand confirmed business decisions and the current stage.
2. Inspect the relevant implementation and existing contracts. Reuse working code where possible.
3. Identify the smallest change that meets the user's request. If the documentation and code disagree, verify the behavior; do not silently invent a resolution.
4. The user's latest explicit requirements take priority. Update PROJECT.md only when an agreed project decision actually changes.

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

## Git workflow (solo developer)

- Use exactly **two ongoing branches**: `local` for internal LAN + PostgreSQL; `internet` for Vercel + Supabase. `local` is the primary/default development branch.
- **Commit changes directly** to the appropriate branch. Do not create extra feature branches or pull requests by default; this repository has one developer.
- Make small, clear commits for completed changes. Modifying existing code is expected; avoid unrelated refactors or extra process.
- Keep one React codebase in each branch. Share fixes between branches only when needed; do not blindly overwrite LAN-specific or Internet-specific configuration.
- Check the current branch and changes before committing. Do not force-push or rewrite history without explicit instruction.

## Completion checklist

1. Explain what changed and why, briefly.
2. Run the relevant existing checks (for the React branch, normally `npm run build`; add targeted tests when logic merits them). Do not build a testing framework just for the harness.
3. Report the actual verification result and any untested device, LAN, backend or cloud integration steps.
4. Keep documentation minimal; update PROJECT.md only when confirmed decisions or current verified status change.
