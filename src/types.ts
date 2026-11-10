export type ConnectionMode = 'lan' | 'internet' | 'offline';
export type CheckResult = 'OK' | 'NO OK';
export type UseYn = 'Y' | 'N';
export type MasterType = 'checklist_item'|'code'|'countermeasure_item'|'equipment'|'location';
export type MasterCursorMap = Record<MasterType, string>;

// Master rows intentionally follow the PostgreSQL column names. The same
// records are stored in IndexedDB, so synchronization does not need a second
// screen-specific mapping layer.
export interface ChecklistItem {
  area_cd: string; equip_type: string; item_id: string;
  item_name_vn: string; item_name_en: string; item_name_ko?: string;
  use_yn: UseYn; create_date: string; update_date: string;
}

export interface Code {
  plant_cd: string; class_id: string; code_id: string; code_nm: string;
  parent_id: string; sort_ord?: number; use_yn: UseYn; value01?: string;
  code_nm_vi?: string; create_date: string; update_date: string;
}

export interface CountermeasureItem {
  area_cd: string; equip_type: string; item_id: string; counter_id: string;
  counter_name_vn: string; counter_name_en: string; counter_name_ko?: string;
  use_yn: UseYn; create_date: string; update_date: string;
}

export interface Equipment {
  equip_id: string; loc_cd: string; equip_type: string; equip_spec: string;
  country_org?: string; prod_year?: string; purchase_date?: string;
  risk_level?: string; frequency?: string; service_date?: string;
  expire_date?: string; status?: string; equip_rfid?: string;
  use_yn: UseYn; create_date: string; update_date: string;
}

export interface Location {
  area_cd: string; fty_cd: string; fty_nm: string;
  building_cd: string; building_nm: string; loc_cd: string; loc_name: string;
  use_yn: UseYn; create_date: string; update_date: string;
}

export interface LocationView {
  plantCd: string; areaLoc: string; wsLoc: string; subWsLoc: string;
  subWsId: string; itemGroupCd: string; subWsName: string;
  factoryName: string; buildingName: string; locationName: string;
  equipSpec: string; riskLevel: string; frequency: string;
}

export interface Schedule {
  plant_cd: string; equip_id: string; schedule_date: string;
  area_cd: string; fty_cd: string; fty_name: string;
  building_cd: string; building_name: string; loc_cd: string; loc_name: string;
  equip_type: string; risk_level: string; frequency: string;
  checked: string; checked_on_date: string; use_yn: UseYn;
  create_date: string; update_date: string;
}
export interface Repair {
  id: string; plantCd: string; areaLoc: string; wsLoc: string; subWsLoc: string;
  itemGroupCd: string; itemCd: string; scheduleDate: string;
  checkDate: string; itemName: string; equipmentName: string;
  countermeasureName: string; completeDate: string; actionStatus: string;
}
export interface InspectionAnswer {
  itemId: string; checkResult: CheckResult; counterId: string; dueDate: string;
}
export interface Inspection {
  id: string; employeeId: string; plantCd: string; equipId: string;
  scheduleDate: string; checkDate: string; createdAt: string;
  items: InspectionAnswer[];
}
export interface RepairCompletion {
  id: string; employeeId: string; repairId: string;
  plantCd: string; areaLoc: string; wsLoc: string; equipId: string;
  itemGroupCd: string; scheduleDate: string; checkDate: string; itemId: string;
  completionComment: string; completedAt: string;
}
export interface OutboxEvent {
  id: string; type: 'inspection' | 'repair'; payload: Inspection | RepairCompletion;
  createdAt: string; attempts: number; nextAttemptAt: number;
  lastError?: string;
}
export interface Profile {
  employeeId: string; fullName: string; deptName?: string; factoryCode?: string;
}
export interface BootstrapData {
  profile?: Profile;
  masters: {
    checklist_item: MasterDelta<ChecklistItem>;
    code: MasterDelta<Code>;
    countermeasure_item: MasterDelta<CountermeasureItem>;
    equipment: MasterDelta<Equipment>;
    location: MasterDelta<Location>;
    schedule: MasterDelta<Schedule>;
  };
  repairs: Repair[];
}
export interface MasterDelta<T> {
  type: string; syncAt: string; data: T[];
  windowFrom?: string; windowTo?: string;
}

export const locationKey = (l: Pick<LocationView,'plantCd'|'areaLoc'|'wsLoc'|'subWsLoc'|'itemGroupCd'>) =>
  [l.plantCd,l.areaLoc,l.wsLoc,l.subWsLoc,l.itemGroupCd].join('|');
export const scheduleKey = (s: Schedule) => [s.plant_cd,s.equip_id,s.schedule_date].join('|');

export function equipmentView(equipment: Equipment, location: Location): LocationView {
  return {
    plantCd: location.area_cd,
    areaLoc: location.area_cd,
    wsLoc: equipment.loc_cd,
    subWsLoc: equipment.equip_id,
    subWsId: equipment.equip_id,
    itemGroupCd: equipment.equip_type,
    subWsName: location.loc_name || equipment.equip_spec || equipment.equip_id,
    factoryName: location.fty_nm,
    buildingName: location.building_nm,
    locationName: location.loc_name,
    equipSpec: equipment.equip_spec,
    riskLevel: equipment.risk_level || '',
    frequency: equipment.frequency || ''
  };
}

export function scheduleView(schedule: Schedule): LocationView {
  return {
    plantCd: schedule.plant_cd,
    areaLoc: schedule.area_cd,
    wsLoc: schedule.loc_cd,
    subWsLoc: schedule.equip_id,
    subWsId: schedule.equip_id,
    itemGroupCd: schedule.equip_type,
    subWsName: schedule.loc_name || schedule.equip_id,
    factoryName: schedule.fty_name,
    buildingName: schedule.building_name,
    locationName: schedule.loc_name,
    equipSpec: '',
    riskLevel: schedule.risk_level,
    frequency: schedule.frequency
  };
}
