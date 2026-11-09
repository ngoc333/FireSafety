export type ConnectionMode = 'lan' | 'internet' | 'offline';
export type CheckResult = 'OK' | 'NO OK';

export interface Location {
  plantCd: string; areaLoc: string; wsLoc: string; subWsLoc: string;
  subWsId: string; itemGroupCd: string; subWsName: string;
  factoryName: string; buildingName: string; locationName: string;
}
export interface ChecklistItem {
  itemGroupCd: string; itemCd: string; itemNameVn: string; itemNameEn?: string;
}
export interface Countermeasure {
  itemGroupCd: string; itemCd: string; counterId: string; counterName: string;
}
export interface Schedule {
  plantCd: string; areaLoc: string; wsLoc: string; subWsLoc: string;
  itemGroupCd: string; scheduleDate: string; riskLevel?: string; frequency?: string;
  isChecked: boolean; checkedOnDate?: string;
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
  plantCd: string; equipId: string; scheduleDate: string; itemId: string;
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
  locations: Location[];
  items: ChecklistItem[];
  countermeasures: Countermeasure[];
  schedules: Schedule[];
  repairs: Repair[];
}
export const locationKey = (l: Pick<Location,'plantCd'|'areaLoc'|'wsLoc'|'subWsLoc'|'itemGroupCd'>) =>
  [l.plantCd,l.areaLoc,l.wsLoc,l.subWsLoc,l.itemGroupCd].join('|');
export const scheduleKey = (s: Schedule) => [locationKey(s),s.scheduleDate].join('|');
