import Dexie, { type EntityTable } from 'dexie';
import { target } from './api';
import { employeeDbName } from './api-target';
import type { BootstrapData, ChecklistItem, Code, CountermeasureItem, Equipment, Inspection, Location, MasterDelta, OutboxEvent, Profile, Repair, Schedule, RepairCompletion } from './types';

type Keyed<T> = T & { key: string };
export interface Setting { key: string; value: string; }

class FireSafetyDB extends Dexie {
  checklist_item!: EntityTable<Keyed<ChecklistItem>, 'key'>;
  code!: EntityTable<Keyed<Code>, 'key'>;
  countermeasure_item!: EntityTable<Keyed<CountermeasureItem>, 'key'>;
  equipment!: EntityTable<Keyed<Equipment>, 'key'>;
  location!: EntityTable<Keyed<Location>, 'key'>;
  schedule!: EntityTable<Keyed<Schedule>, 'key'>;
  repairs!: EntityTable<Repair, 'id'>;
  inspections!: EntityTable<Inspection, 'id'>;
  completions!: EntityTable<RepairCompletion, 'id'>;
  outbox!: EntityTable<OutboxEvent, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      locations: 'key,subWsId,itemGroupCd,plantCd',
      items: 'key,itemGroupCd',
      countermeasures: 'key,itemGroupCd,itemCd',
      schedules: 'key,scheduleDate',
      repairs: 'id,subWsLoc,actionStatus',
      inspections: 'id,employeeId,createdAt',
      completions: 'id,repairId',
      outbox: 'id,nextAttemptAt,createdAt',
      settings: 'key'
    });
    // Master stores deliberately follow the PostgreSQL table names. Version 2
    // removes only the old master stores; local inspections, completions and
    // outbox events are retained by Dexie.
    this.version(2).stores({
      checklist_item: 'key,equip_type,item_id,update_date,use_yn',
      code: 'key,plant_cd,class_id,code_id,update_date,use_yn',
      countermeasure_item: 'key,equip_type,item_id,counter_id,update_date,use_yn',
      equipment: 'key,equip_id,loc_cd,equip_type,update_date,use_yn',
      location: 'key,loc_cd,area_cd,update_date,use_yn',
      schedule: 'key,schedule_date,equip_id,area_cd',
      repairs: 'id,subWsLoc,actionStatus',
      inspections: 'id,employeeId,createdAt',
      completions: 'id,repairId',
      outbox: 'id,nextAttemptAt,createdAt',
      settings: 'key'
    });
  }
}

// Identity metadata is tiny and scoped per backend. Business data is scoped per employee.
class IdentityDB extends Dexie {
  profiles!: EntityTable<Profile, 'employeeId'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor() {
    super('FireSafety_identity_' + target);
    this.version(1).stores({ profiles: 'employeeId', settings: 'key' });
  }
}

export const identityDB = new IdentityDB();
let activeEmployee = '';
export let db = new FireSafetyDB('FireSafety_' + target + '_signed_out');

export function currentEmployee(): string { return activeEmployee; }

export function activateEmployee(employeeId: string | null): void {
  const next = employeeId?.trim() ?? '';
  if (next === activeEmployee) return;
  db.close();
  activeEmployee = next;
  db = new FireSafetyDB(next
    ? employeeDbName(target, next)
    : 'FireSafety_' + target + '_signed_out');
}

export type MasterCursorMap = Record<'checklist_item'|'code'|'countermeasure_item'|'equipment'|'location', string>;
const masterCursorKey = (type: keyof MasterCursorMap) => 'masterCursor:' + type;
const keyForChecklist = (x: ChecklistItem) => [x.area_cd,x.equip_type,x.item_id].join('|');
const keyForCode = (x: Code) => [x.plant_cd,x.class_id,x.code_id,x.parent_id].join('|');
const keyForCountermeasure = (x: CountermeasureItem) => [x.area_cd,x.equip_type,x.item_id,x.counter_id].join('|');
const keyForEquipment = (x: Equipment) => x.equip_id;
const keyForLocation = (x: Location) => [x.area_cd,x.fty_cd,x.building_cd,x.loc_cd].join('|');
const keyForSchedule = (x: Schedule) => [x.plant_cd,x.equip_id,x.schedule_date].join('|');

export async function getMasterCursors(): Promise<MasterCursorMap> {
  const result = {} as MasterCursorMap;
  for (const type of ['checklist_item','code','countermeasure_item','equipment','location'] as const) {
    result[type] = (await db.settings.get(masterCursorKey(type)))?.value ?? '';
  }
  return result;
}

export async function applyBootstrap(data: BootstrapData): Promise<void> {
  if (!activeEmployee) throw new Error('No active employee');
  if (data.profile && data.profile.employeeId !== activeEmployee) throw new Error('Wrong employee in bootstrap');
  const employeeDB = db;
  // Replace/merge only server-owned caches; never clear local edits or outbox.
  await employeeDB.transaction('rw', [employeeDB.checklist_item, employeeDB.code,
    employeeDB.countermeasure_item, employeeDB.equipment, employeeDB.location,
    employeeDB.schedule, employeeDB.repairs, employeeDB.settings], async () => {
    await applyDelta(employeeDB.checklist_item, data.masters.checklist_item, keyForChecklist, 'checklist_item');
    await applyDelta(employeeDB.code, data.masters.code, keyForCode, 'code');
    await applyDelta(employeeDB.countermeasure_item, data.masters.countermeasure_item, keyForCountermeasure, 'countermeasure_item');
    await applyDelta(employeeDB.equipment, data.masters.equipment, keyForEquipment, 'equipment');
    await applyDelta(employeeDB.location, data.masters.location, keyForLocation, 'location');
    await employeeDB.schedule.clear();
    await employeeDB.schedule.bulkPut(data.masters.schedule.data.map(x => ({...x,key:keyForSchedule(x)})));
    await employeeDB.repairs.clear();
    await employeeDB.repairs.bulkPut(data.repairs);
    for (const type of ['checklist_item','code','countermeasure_item','equipment','location'] as const) {
      await employeeDB.settings.put({key:masterCursorKey(type),value:data.masters[type].syncAt});
    }
  });
  if (data.profile) await identityDB.profiles.put(data.profile);
  await employeeDB.settings.put({key:'lastBootstrap',value:new Date().toISOString()});
}

async function applyDelta<T>(table: EntityTable<Keyed<T>, 'key'>, delta: MasterDelta<T>, key: (row: T) => string, type: string): Promise<void> {
  if (delta.type.toUpperCase() !== type.toUpperCase()) throw new Error('Wrong master response type: ' + delta.type);
  await table.bulkPut(delta.data.map(row => ({...row,key:key(row)})) as never[]);
}

export async function saveInspection(inspection: Inspection): Promise<void> {
  if (!activeEmployee || inspection.employeeId !== activeEmployee) throw new Error('Wrong inspection owner');
  const event: OutboxEvent = { id: inspection.id, type:'inspection', payload:inspection,
    createdAt:inspection.createdAt, attempts:0, nextAttemptAt:0 };
  await db.transaction('rw',db.inspections,db.outbox, async () => {
    await db.inspections.put(inspection);
    await db.outbox.put(event);
  });
}

export async function saveCompletion(completion: RepairCompletion): Promise<void> {
  if (!activeEmployee || completion.employeeId !== activeEmployee) throw new Error('Wrong repair owner');
  const event: OutboxEvent = { id:completion.id, type:'repair', payload:completion,
    createdAt:completion.completedAt,attempts:0,nextAttemptAt:0 };
  await db.transaction('rw',db.completions,db.outbox,async()=>{
    await db.completions.put(completion);
    await db.outbox.put(event);
  });
}
