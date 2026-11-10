// Convert the RSM gateway's PostgreSQL rows into the shared FireSafety API data shape.
// Keep database column names here, never in React screens.
const prop = (obj, key) => obj && typeof obj === 'object'
  ? Object.entries(obj).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1]
  : undefined;
const str = (row, ...keys) => {
  for (const key of keys) {
    const value = prop(row, key);
    if (value !== undefined && value !== null) return String(value);
  }
  return '';
};
const yn = value => ['Y', 'TRUE', 'T', '1'].includes(String(value ?? '').toUpperCase());
export const dateKey = value => {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10).replace(/-/g, '') : text;
};

export function rsmRows(root) {
  if (prop(root, 'success') === false) throw Error('RSM rejected database call');
  if (Array.isArray(root)) return root;
  const keys = ['rows', 'result', 'data', 'value'];
  for (const key of keys) {
    const value = prop(root, key);
    if (Array.isArray(value)) return value;
    for (const nested of keys) {
      const candidate = prop(value, nested);
      if (Array.isArray(candidate)) return candidate;
    }
  }
  throw Error('RSM response does not contain an array of rows');
}

// dz_web_get_master returns one jsonb value. RSM commonly wraps that value in
// data[0].<functionName>; accept the other gateway envelopes as well so the
// database column shape is normalized in the LAN adapter, not in React.
export function rsmJson(root, functionName) {
  let value = root;
  const directType = prop(root, 'type');
  const nestedData = prop(root, 'data');
  const nestedValue = nestedData && typeof nestedData === 'object' && !Array.isArray(nestedData)
    ? prop(nestedData, functionName) : undefined;
  if (nestedValue !== undefined) {
    value = nestedValue;
  } else if (!directType && (Array.isArray(root) || prop(root, 'rows') || prop(root, 'result') || prop(root, 'data'))) {
    const rows = rsmRows(root);
    value = rows.length === 1 ? rows[0] : rows;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    value = prop(value, functionName) ?? prop(value, 'result') ?? prop(value, 'value') ?? value;
  }
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw Error('RSM master response contains invalid JSON'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Error('RSM master response is not an object');
  }
  const type = str(value, 'type');
  const syncAt = str(value, 'syncAt', 'sync_at');
  const rows = prop(value, 'data');
  if (!type || !syncAt || !Array.isArray(rows)) throw Error('RSM master response is incomplete');
  return {
    type, syncAt, data: rows,
    ...(str(value, 'windowFrom', 'window_from') ? {windowFrom: str(value, 'windowFrom', 'window_from')} : {}),
    ...(str(value, 'windowTo', 'window_to') ? {windowTo: str(value, 'windowTo', 'window_to')} : {})
  };
}

export function mapBootstrap({ profile, locations, items, countermeasures, schedules, repairs }) {
  const loc = locations.map(r => ({
    plantCd: str(r, 'PLANT_CD'), areaLoc: str(r, 'AREA_LOC'),
    wsLoc: str(r, 'WS_LOC'), subWsLoc: str(r, 'SUB_WS_LOC'),
    subWsId: str(r, 'SUB_WS_ID'), subWsName: str(r, 'SUB_WS_NAME'),
    itemGroupCd: str(r, 'ITEM_GROUP_CD'), factoryName: str(r, 'FTY_NAME'),
    buildingName: str(r, 'BUILDING_NM'), locationName: str(r, 'LOC_NAME')
  }));
  const checkItems = items.map(r => ({
    itemGroupCd: str(r, 'ITEM_GROUP_CD'), itemCd: str(r, 'ITEM_CD'),
    itemNameVn: str(r, 'ITEM_NAME_VN'), itemNameEn: str(r, 'ITEM_NAME_EN')
  }));
  const counters = countermeasures.map(r => ({
    itemGroupCd: str(r, 'ITEM_GROUP_CD'), itemCd: str(r, 'ITEM_CD'),
    counterId: str(r, 'CHECK_CM_CD'), counterName: str(r, 'CHECK_CM_VN', 'CHECK_CM_EN')
  }));
  // fn_dz_scan_get_schedule exposes AREA_CD/LOC_CD/EQUIP_ID/EQUIP_TYPE;
  // the master location function exposes AREA_LOC/WS_LOC/SUB_WS_LOC/ITEM_GROUP_CD.
  const dates = schedules.map(r => ({
    plantCd: str(r, 'PLANT_CD'), areaLoc: str(r, 'AREA_CD', 'AREA_LOC'),
    wsLoc: str(r, 'LOC_CD', 'WS_LOC'), subWsLoc: str(r, 'EQUIP_ID', 'SUB_WS_LOC'),
    itemGroupCd: str(r, 'EQUIP_TYPE', 'ITEM_GROUP_CD'),
    scheduleDate: dateKey(str(r, 'SCHEDULE_DATE')), riskLevel: str(r, 'RISK_LEVEL'),
    frequency: str(r, 'FREQUENCY'), isChecked: yn(str(r, 'CHECKED')),
    checkedOnDate: dateKey(str(r, 'CHECKED_ON_DATE'))
  }));
  const repairList = repairs.map(r => {
    const plantCd = str(r, 'PLANT_CD'), areaLoc = str(r, 'AREA_LOC');
    const wsLoc = str(r, 'WS_LOC'), subWsLoc = str(r, 'SUB_WS_LOC');
    const itemGroupCd = str(r, 'ITEM_GROUP_CD'), itemCd = str(r, 'ITEM_CD');
    const scheduleDate = dateKey(str(r, 'SCHEDULE_DATE'));
    const checkDate = dateKey(str(r, 'CHECK_DATE'));
    const location = loc.find(x => x.plantCd === plantCd && x.areaLoc === areaLoc
      && x.wsLoc === wsLoc && x.subWsLoc === subWsLoc && x.itemGroupCd === itemGroupCd);
    const item = checkItems.find(x => x.itemGroupCd === itemGroupCd && x.itemCd === itemCd);
    const counter = counters.find(x => x.itemGroupCd === itemGroupCd
      && x.itemCd === itemCd && x.counterId === str(r, 'CHECK_CM'));
    return {
      id: [plantCd, areaLoc, wsLoc, subWsLoc, itemGroupCd, itemCd,
        scheduleDate, checkDate].join('|'),
      plantCd, areaLoc, wsLoc, subWsLoc, itemGroupCd, itemCd, scheduleDate,
      checkDate, itemName: str(r, 'ITEM_NAME_VN') || item?.itemNameVn || itemCd,
      equipmentName: str(r, 'SUB_WS_NAME') || location?.subWsName || subWsLoc,
      countermeasureName: str(r, 'CHECK_CM_VN') || counter?.counterName || str(r, 'CHECK_CM'),
      completeDate: dateKey(str(r, 'COMPLETE_DATE')),
      actionStatus: str(r, 'ACTION_STATUS') || 'OPEN'
    };
  });
  return { profile, locations: loc, items: checkItems,
    countermeasures: counters, schedules: dates, repairs: repairList };
}

export function mapRepairs(repairs) {
  return repairs.map(r => {
    const plantCd = str(r, 'PLANT_CD'), areaLoc = str(r, 'AREA_LOC');
    const wsLoc = str(r, 'WS_LOC'), subWsLoc = str(r, 'SUB_WS_LOC');
    const itemGroupCd = str(r, 'ITEM_GROUP_CD'), itemCd = str(r, 'ITEM_CD');
    const scheduleDate = dateKey(str(r, 'SCHEDULE_DATE'));
    const checkDate = dateKey(str(r, 'CHECK_DATE'));
    return {
      id: [plantCd, areaLoc, wsLoc, subWsLoc, itemGroupCd, itemCd, scheduleDate, checkDate].join('|'),
      plantCd, areaLoc, wsLoc, subWsLoc, itemGroupCd, itemCd, scheduleDate, checkDate,
      itemName: str(r, 'ITEM_NAME_VN') || itemCd,
      equipmentName: str(r, 'SUB_WS_NAME') || subWsLoc,
      countermeasureName: str(r, 'CHECK_CM_VN', 'CHECK_CM'),
      completeDate: dateKey(str(r, 'COMPLETE_DATE')),
      actionStatus: str(r, 'ACTION_STATUS') || 'OPEN'
    };
  });
}
