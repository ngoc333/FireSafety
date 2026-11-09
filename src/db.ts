import Dexie, { type EntityTable } from 'dexie';
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
  profiles!: EntityTable<Profile, 'employeeId'>;

  constructor() {
    super('FireSafety');
    this.version(1).stores({
      locations: 'key,subWsId,itemGroupCd,plantCd',
      items: 'key,itemGroupCd',
      countermeasures: 'key,itemGroupCd,itemCd',
      schedules: 'key,scheduleDate',
      repairs: 'id,subWsLoc,actionStatus',
      inspections: 'id,employeeId,createdAt',
      completions: 'id,repairId',
      outbox: 'id,nextAttemptAt,createdAt',
      settings: 'key',
      profiles: 'employeeId'
    });
  }
}

export const db = new FireSafetyDB();

export async function applyBootstrap(data: BootstrapData): Promise<void> {
  // Replace only server-owned caches; never clear local edits or outbox.
  await db.transaction('rw', db.locations, db.items, db.countermeasures, db.schedules, db.repairs, async () => {
    await db.locations.clear();
    await db.items.clear();
    await db.countermeasures.clear();
    await db.schedules.clear();
    await db.repairs.clear();
    await db.locations.bulkPut(data.locations.map(x => ({...x,key:locationKey(x)})));
    await db.items.bulkPut(data.items.map(x => ({...x,key:x.itemGroupCd+'|'+x.itemCd})));
    await db.countermeasures.bulkPut(data.countermeasures.map(x => ({...x,key:x.itemGroupCd+'|'+x.itemCd+'|'+x.counterId})));
    await db.schedules.bulkPut(data.schedules.map(x => ({...x,key:scheduleKey(x)})));
    await db.repairs.bulkPut(data.repairs);
  });
  if (data.profile) await db.profiles.put(data.profile);
  await db.settings.put({key:'lastBootstrap',value:new Date().toISOString()});
}

export async function saveInspection(inspection: Inspection): Promise<void> {
  const event: OutboxEvent = { id: inspection.id, type:'inspection', payload:inspection,
    createdAt:inspection.createdAt, attempts:0, nextAttemptAt:0 };
  await db.transaction('rw',db.inspections,db.outbox, async () => {
    await db.inspections.put(inspection);
    await db.outbox.put(event);
  });
}

export async function saveCompletion(completion: RepairCompletion): Promise<void> {
  const event: OutboxEvent = { id:completion.id, type:'repair', payload:completion,
    createdAt:completion.completedAt,attempts:0,nextAttemptAt:0 };
  await db.transaction('rw',db.completions,db.outbox,async()=>{
    await db.completions.put(completion);
    await db.outbox.put(event);
  });
}
