import Dexie, { type EntityTable } from 'dexie';
import { target } from './api';
import { employeeDbName } from './api-target';
import type { BootstrapData, ChecklistItem, Countermeasure, Inspection, Location, OutboxEvent, Profile, Repair, Schedule, RepairCompletion } from './types';
import { locationKey, scheduleKey } from './types';

type Keyed<T> = T & { key: string };
export interface Setting { key: string; value: string; }

class FireSafetyDB extends Dexie {
  locations!: EntityTable<Keyed<Location>, 'key'>;
  items!: EntityTable<Keyed<ChecklistItem>, 'key'>;
  countermeasures!: EntityTable<Keyed<Countermeasure>, 'key'>;
  schedules!: EntityTable<Keyed<Schedule>, 'key'>;
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


export async function applyBootstrap(data: BootstrapData): Promise<void> {
  if (!activeEmployee) throw new Error('No active employee');
  if (data.profile && data.profile.employeeId !== activeEmployee) throw new Error('Wrong employee in bootstrap');
  const employeeDB = db;
  // Replace only server-owned caches; never clear local edits or outbox.
  await employeeDB.transaction('rw', employeeDB.locations, employeeDB.items, employeeDB.countermeasures, employeeDB.schedules, employeeDB.repairs, async () => {
    await employeeDB.locations.clear();
    await employeeDB.items.clear();
    await employeeDB.countermeasures.clear();
    await employeeDB.schedules.clear();
    await employeeDB.repairs.clear();
    await employeeDB.locations.bulkPut(data.locations.map(x => ({...x,key:locationKey(x)})));
    await employeeDB.items.bulkPut(data.items.map(x => ({...x,key:x.itemGroupCd+'|'+x.itemCd})));
    await employeeDB.countermeasures.bulkPut(data.countermeasures.map(x => ({...x,key:x.itemGroupCd+'|'+x.itemCd+'|'+x.counterId})));
    await employeeDB.schedules.bulkPut(data.schedules.map(x => ({...x,key:scheduleKey(x)})));
    await employeeDB.repairs.bulkPut(data.repairs);
  });
  if (data.profile) await identityDB.profiles.put(data.profile);
  await employeeDB.settings.put({key:'lastBootstrap',value:new Date().toISOString()});
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
