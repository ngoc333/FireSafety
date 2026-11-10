-- FireSafety LAN master synchronization for PostgreSQL schema rsm.
-- Review the backup and run this script in a controlled maintenance window.
-- It preserves value01..value05. value06 is the existing unused status slot
-- for these five tables and is renamed to use_yn (Y/N).

BEGIN;

ALTER TABLE rsm.dz_checklist_items RENAME COLUMN value06 TO use_yn;
ALTER TABLE rsm.dz_countermeasure_items RENAME COLUMN value06 TO use_yn;
ALTER TABLE rsm.dz_equipment RENAME COLUMN value06 TO use_yn;
ALTER TABLE rsm.dz_location RENAME COLUMN value06 TO use_yn;
ALTER TABLE rsm.dz_schedule RENAME COLUMN value06 TO use_yn;

-- The current values are NULL in the inspected database. Keep the conversion
-- explicit so an unexpected future value fails instead of becoming active.
UPDATE rsm.dz_checklist_items SET use_yn = 1 WHERE use_yn IS NULL;
UPDATE rsm.dz_countermeasure_items SET use_yn = 1 WHERE use_yn IS NULL;
UPDATE rsm.dz_equipment SET use_yn = 1 WHERE use_yn IS NULL;
UPDATE rsm.dz_location SET use_yn = 1 WHERE use_yn IS NULL;
UPDATE rsm.dz_schedule SET use_yn = 'Y' WHERE use_yn IS NULL OR btrim(use_yn) = '';
UPDATE rsm.dz_code SET use_yn = 'Y' WHERE use_yn IS NULL OR btrim(use_yn) = '';

ALTER TABLE rsm.dz_checklist_items
  ALTER COLUMN use_yn TYPE varchar(1)
    USING CASE WHEN use_yn = 1 THEN 'Y' WHEN use_yn = 0 THEN 'N' ELSE NULL END;
ALTER TABLE rsm.dz_countermeasure_items
  ALTER COLUMN use_yn TYPE varchar(1)
    USING CASE WHEN use_yn = 1 THEN 'Y' WHEN use_yn = 0 THEN 'N' ELSE NULL END;
ALTER TABLE rsm.dz_equipment
  ALTER COLUMN use_yn TYPE varchar(1)
    USING CASE WHEN use_yn = 1 THEN 'Y' WHEN use_yn = 0 THEN 'N' ELSE NULL END;
ALTER TABLE rsm.dz_location
  ALTER COLUMN use_yn TYPE varchar(1)
    USING CASE WHEN use_yn = 1 THEN 'Y' WHEN use_yn = 0 THEN 'N' ELSE NULL END;
ALTER TABLE rsm.dz_schedule
  ALTER COLUMN use_yn TYPE varchar(1)
    USING CASE WHEN upper(btrim(use_yn)) IN ('Y', '1', 'TRUE', 'T') THEN 'Y'
               WHEN upper(btrim(use_yn)) IN ('N', '0', 'FALSE', 'F') THEN 'N'
               ELSE NULL END;

-- Historical rows without timestamps are assigned the migration time. Existing
-- dates are interpreted as Asia/Ho_Chi_Minh midnight before becoming timestamptz.
ALTER TABLE rsm.dz_checklist_items
  ALTER COLUMN create_date TYPE timestamptz
    USING CASE WHEN create_date IS NULL THEN NULL ELSE create_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
  ALTER COLUMN update_date TYPE timestamptz
    USING CASE WHEN update_date IS NULL THEN NULL ELSE update_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END;
ALTER TABLE rsm.dz_code
  ALTER COLUMN create_date TYPE timestamptz
    USING CASE WHEN create_date IS NULL THEN NULL ELSE create_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
  ALTER COLUMN update_date TYPE timestamptz
    USING CASE WHEN update_date IS NULL THEN NULL ELSE update_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END;
ALTER TABLE rsm.dz_countermeasure_items
  ALTER COLUMN create_date TYPE timestamptz
    USING CASE WHEN create_date IS NULL THEN NULL ELSE create_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
  ALTER COLUMN update_date TYPE timestamptz
    USING CASE WHEN update_date IS NULL THEN NULL ELSE update_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END;
ALTER TABLE rsm.dz_equipment
  ALTER COLUMN create_date TYPE timestamptz
    USING CASE WHEN create_date IS NULL THEN NULL ELSE create_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
  ALTER COLUMN update_date TYPE timestamptz
    USING CASE WHEN update_date IS NULL THEN NULL ELSE update_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END;
ALTER TABLE rsm.dz_location
  ALTER COLUMN create_date TYPE timestamptz
    USING CASE WHEN create_date IS NULL THEN NULL ELSE create_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
  ALTER COLUMN update_date TYPE timestamptz
    USING CASE WHEN update_date IS NULL THEN NULL ELSE update_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END;
ALTER TABLE rsm.dz_schedule
  ALTER COLUMN create_date TYPE timestamptz
    USING CASE WHEN create_date IS NULL THEN NULL ELSE create_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
  ALTER COLUMN update_date TYPE timestamptz
    USING CASE WHEN update_date IS NULL THEN NULL ELSE update_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' END;

UPDATE rsm.dz_checklist_items SET create_date = COALESCE(create_date, clock_timestamp()), update_date = COALESCE(update_date, create_date, clock_timestamp());
UPDATE rsm.dz_code SET create_date = COALESCE(create_date, clock_timestamp()), update_date = COALESCE(update_date, create_date, clock_timestamp());
UPDATE rsm.dz_countermeasure_items SET create_date = COALESCE(create_date, clock_timestamp()), update_date = COALESCE(update_date, create_date, clock_timestamp());
UPDATE rsm.dz_equipment SET create_date = COALESCE(create_date, clock_timestamp()), update_date = COALESCE(update_date, create_date, clock_timestamp());
UPDATE rsm.dz_location SET create_date = COALESCE(create_date, clock_timestamp()), update_date = COALESCE(update_date, create_date, clock_timestamp());
UPDATE rsm.dz_schedule SET create_date = COALESCE(create_date, clock_timestamp()), update_date = COALESCE(update_date, create_date, clock_timestamp());

DO $migration$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'dz_checklist_items', 'dz_code', 'dz_countermeasure_items',
    'dz_equipment', 'dz_location', 'dz_schedule'
  ] LOOP
    EXECUTE format('ALTER TABLE rsm.%I ALTER COLUMN use_yn SET DEFAULT ''Y''', table_name);
    EXECUTE format('ALTER TABLE rsm.%I ALTER COLUMN use_yn SET NOT NULL', table_name);
    EXECUTE format('ALTER TABLE rsm.%I ALTER COLUMN create_date SET DEFAULT clock_timestamp()', table_name);
    EXECUTE format('ALTER TABLE rsm.%I ALTER COLUMN create_date SET NOT NULL', table_name);
    EXECUTE format('ALTER TABLE rsm.%I ALTER COLUMN update_date SET DEFAULT clock_timestamp()', table_name);
    EXECUTE format('ALTER TABLE rsm.%I ALTER COLUMN update_date SET NOT NULL', table_name);
    EXECUTE format('ALTER TABLE rsm.%I DROP CONSTRAINT IF EXISTS %I', table_name, table_name || '_use_yn_ck');
    EXECUTE format('ALTER TABLE rsm.%I ADD CONSTRAINT %I CHECK (use_yn IN (''Y'', ''N''))', table_name, table_name || '_use_yn_ck');
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION rsm.dz_web_touch_update_date()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.update_date := clock_timestamp();
  RETURN NEW;
END;
$function$;

DO $triggers$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'dz_checklist_items', 'dz_code', 'dz_countermeasure_items',
    'dz_equipment', 'dz_location', 'dz_schedule'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON rsm.%I', table_name || '_web_update_date', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON rsm.%I FOR EACH ROW EXECUTE FUNCTION rsm.dz_web_touch_update_date()', table_name || '_web_update_date', table_name);
  END LOOP;
END;
$triggers$;

CREATE INDEX IF NOT EXISTS idx_dz_checklist_items_web_update ON rsm.dz_checklist_items (update_date);
CREATE INDEX IF NOT EXISTS idx_dz_code_web_update ON rsm.dz_code (update_date);
CREATE INDEX IF NOT EXISTS idx_dz_countermeasure_items_web_update ON rsm.dz_countermeasure_items (update_date);
CREATE INDEX IF NOT EXISTS idx_dz_equipment_web_update ON rsm.dz_equipment (update_date);
CREATE INDEX IF NOT EXISTS idx_dz_location_web_update ON rsm.dz_location (update_date);
CREATE INDEX IF NOT EXISTS idx_dz_schedule_web_window ON rsm.dz_schedule (plant_cd, schedule_date) WHERE use_yn = 'Y';

CREATE OR REPLACE FUNCTION rsm.dz_web_get_master(
  p_emp_id varchar,
  p_type varchar,
  p_updated_after timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
AS $function$
DECLARE
  v_type varchar := upper(btrim(p_type));
  v_sync_at timestamptz := clock_timestamp();
  v_window_from date := current_date - 7;
  v_window_to date := current_date + 7;
  v_data jsonb;
BEGIN
  -- p_emp_id is deliberately retained in the contract. Employee filtering is
  -- not enabled in this first LAN master release, but can be added here later.
  IF v_type = 'CHECKLIST_ITEM' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.area_cd, x.equip_type, x.item_id), '[]'::jsonb)
      INTO v_data FROM rsm.dz_checklist_items x
     WHERE x.update_date <= v_sync_at
       AND ((p_updated_after IS NULL AND x.use_yn = 'Y') OR (p_updated_after IS NOT NULL AND x.update_date > p_updated_after));
  ELSIF v_type = 'CODE' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.plant_cd, x.class_id, x.sort_ord, x.code_id), '[]'::jsonb)
      INTO v_data FROM rsm.dz_code x
     WHERE x.update_date <= v_sync_at
       AND ((p_updated_after IS NULL AND x.use_yn = 'Y') OR (p_updated_after IS NOT NULL AND x.update_date > p_updated_after));
  ELSIF v_type = 'COUNTERMEASURE_ITEM' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.area_cd, x.equip_type, x.item_id, x.counter_id), '[]'::jsonb)
      INTO v_data FROM rsm.dz_countermeasure_items x
     WHERE x.update_date <= v_sync_at
       AND ((p_updated_after IS NULL AND x.use_yn = 'Y') OR (p_updated_after IS NOT NULL AND x.update_date > p_updated_after));
  ELSIF v_type = 'EQUIPMENT' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.equip_id), '[]'::jsonb)
      INTO v_data FROM rsm.dz_equipment x
     WHERE x.update_date <= v_sync_at
       AND ((p_updated_after IS NULL AND x.use_yn = 'Y') OR (p_updated_after IS NOT NULL AND x.update_date > p_updated_after));
  ELSIF v_type = 'LOCATION' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.area_cd, x.fty_cd, x.building_cd, x.loc_cd), '[]'::jsonb)
      INTO v_data FROM rsm.dz_location x
     WHERE x.update_date <= v_sync_at
       AND ((p_updated_after IS NULL AND x.use_yn = 'Y') OR (p_updated_after IS NOT NULL AND x.update_date > p_updated_after));
  ELSIF v_type = 'SCHEDULE' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(s) || jsonb_build_object(
        'area_cd', l.area_cd, 'fty_cd', l.fty_cd, 'fty_name', l.fty_nm,
        'building_cd', l.building_cd, 'building_name', l.building_nm,
        'loc_cd', l.loc_cd, 'loc_name', l.loc_name,
        'equip_type', e.equip_type, 'risk_level', e.risk_level,
        'frequency', e.frequency, 'checked', CASE WHEN r.inspection_date IS NULL THEN 'N' ELSE 'Y' END,
        'checked_on_date', COALESCE(to_char(r.inspection_date, 'YYYYMMDD'), ''))
      ORDER BY s.schedule_date, s.equip_id), '[]'::jsonb)
      INTO v_data
      FROM rsm.dz_schedule s
      JOIN rsm.dz_equipment e ON e.equip_id = s.equip_id AND e.use_yn = 'Y'
      JOIN rsm.dz_location l ON l.loc_cd = e.loc_cd AND l.use_yn = 'Y'
     LEFT JOIN rsm.dz_inspection_result r ON r.plant_cd = s.plant_cd
        AND r.equip_id = s.equip_id AND r.schedule_date = s.schedule_date
     WHERE s.use_yn = 'Y'
       AND s.schedule_date BETWEEN to_char(v_window_from, 'YYYYMMDD') AND to_char(v_window_to, 'YYYYMMDD');
  ELSE
    RAISE EXCEPTION 'Unsupported master type: %', p_type;
  END IF;

  RETURN jsonb_build_object(
    'type', v_type,
    'syncAt', v_sync_at,
    'windowFrom', CASE WHEN v_type = 'SCHEDULE' THEN v_window_from ELSE NULL END,
    'windowTo', CASE WHEN v_type = 'SCHEDULE' THEN v_window_to ELSE NULL END,
    'data', v_data
  );
END;
$function$;

COMMENT ON FUNCTION rsm.dz_web_get_master(varchar, varchar, timestamptz)
  IS 'FireSafety web master delta; p_emp_id is reserved for future authorization and schedule currently uses the server window.';

COMMIT;
