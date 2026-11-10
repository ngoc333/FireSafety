import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rsmRows, mapBootstrap, dateKey } from '../server/rsm-mapping.mjs';

test('RSM returns arrays in supported envelope formats', () => {
  const rows = [{ PLANT_CD: '2210' }];
  for (const body of [rows, { data: rows }, { rows }, { result: rows },
    { DATA: { ROWS: rows } }, { value: { result: rows } }]) {
    assert.deepEqual(rsmRows(body), rows);
  }
  assert.throws(() => rsmRows({ data: { other: 'bad' } }), /array/);
  assert.throws(() => rsmRows({ success: false, data: [] }), /rejected/);
});

test('mapping handles actual Android RSM column names and repairs', () => {
  const result = mapBootstrap({
    profile: { employeeId: '12345', fullName: 'Worker' },
    locations: [{ PLANT_CD: '2210', AREA_LOC: 'A', WS_LOC: 'W', SUB_WS_LOC: 'E01',
      SUB_WS_ID: 'QR01', SUB_WS_NAME: 'Extinguisher', ITEM_GROUP_CD: 'G',
      FTY_NAME: 'F', BUILDING_NM: 'B', LOC_NAME: 'L' }],
    items: [{ ITEM_GROUP_CD: 'G', ITEM_CD: 'I1', ITEM_NAME_VN: 'Kiem tra' }],
    countermeasures: [{ ITEM_GROUP_CD: 'G', ITEM_CD: 'I1', CHECK_CM_CD: 'C1', CHECK_CM_VN: 'Sua chua' }],
    schedules: [{ PLANT_CD: '2210', AREA_CD: 'A', LOC_CD: 'W', EQUIP_ID: 'E01',
      EQUIP_TYPE: 'G', SCHEDULE_DATE: '2026-11-10', CHECKED: 'Y' }],
    repairs: [{ PLANT_CD: '2210', AREA_LOC: 'A', WS_LOC: 'W', SUB_WS_LOC: 'E01',
      ITEM_GROUP_CD: 'G', ITEM_CD: 'I1', SCHEDULE_DATE: '20261110', CHECK_DATE: '20261110',
      CHECK_CM: 'C1', ACTION_STATUS: 'OPEN', COMPLETE_DATE: '2026-11-25' }]
  });
  assert.equal(result.locations[0].subWsId, 'QR01');
  assert.equal(result.schedules[0].areaLoc, 'A');
  assert.equal(result.schedules[0].itemGroupCd, 'G');
  assert.equal(result.schedules[0].scheduleDate, '20261110');
  assert.equal(result.schedules[0].isChecked, true);
  assert.equal(result.repairs[0].id, '2210|A|W|E01|G|I1|20261110|20261110');
  assert.equal(result.repairs[0].itemName, 'Kiem tra');
  assert.equal(result.repairs[0].equipmentName, 'Extinguisher');
  assert.equal(result.repairs[0].countermeasureName, 'Sua chua');
  assert.equal(result.repairs[0].completeDate, '20261125');
  assert.equal(dateKey('2026-11-10T00:00:00'), '20261110');
});
