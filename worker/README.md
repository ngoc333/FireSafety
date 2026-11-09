# FireSafety C# LAN worker

This is a minimal bridge: Supabase -> internal PostgreSQL events, and internal PostgreSQL -> Supabase reference data. It does NOT connect browser clients to private databases.

Environment variables (on the internal Windows/Linux server only):
- `FIRE_SAFETY_PG_CONNECTION`: Npgsql connection string, from secure service configuration.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: secret; NEVER expose to Vite, Git, Vercel or PWA.

## Required SQL integration on the existing internal PostgreSQL

The source repository proves the existing `fn_dz_scan_save_inspection(p_payload)` function and `fn_dz_scan_save_item_images(p_payload)` (image-based repair API). It does NOT establish a text-only repair function or a cloud export view.

Before enabling the worker, implement/test TWO explicit SQL contracts in the internal DB:

1. `firesafety_import_event(p_id uuid,p_kind text,p_payload jsonb) returns boolean`: in one transaction, insert `p_id` into a unique processed-event table (no-op if already processed), verify the employee/equipment/schedule, call the existing inspection procedure for `inspection`, and the approved new text-only repair function for `repair`. Roll back the transaction on errors. This must be idempotent.
2. `firesafety_cloud_export` VIEW with columns `owner_uid uuid, table_name text, record_key text, data jsonb`. Include employee-scoped location, item, countermeasure, schedule and repair records with EXACT camelCase JSON specified in `src/types.ts`. `owner_uid` is the real Supabase Auth user UID; do not invent mapping. Populate `fs_profiles` securely using the same UID.

The current worker deliberately does not invent those production database objects. Deploying it before creating the contracts will produce an explicit SQL error. For small datasets it performs a full UPSERT every 30 seconds; for large datasets, implement an incremental export cursor instead of prematurely adding general-purpose sync infrastructure.

For deletions, arrange explicit tombstones/periodic reconciliation; the minimal upsert exporter does not delete stale Supabase rows. For repair completion, the snapshot must remove or mark closed rows in Supabase as appropriate. Follow-up integration testing is required.

Run locally (after secrets are configured): `dotnet run --project worker/FireSafety.Worker`.
