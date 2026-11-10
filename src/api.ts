import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveApiTarget } from './api-target';
import type { BootstrapData, Inspection, MasterCursorMap, MasterDelta, OutboxEvent, Profile, Repair } from './types';

export const target = resolveApiTarget(window.location.hostname);
// The hostname selects LAN or Internet; it never changes the LAN API address.
export const LAN_API_BASE = 'https://172.30.10.124:5179';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabase: SupabaseClient | null =
  target === 'internet' && supabaseUrl && anonKey
    ? createClient(supabaseUrl, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

let lanToken = sessionStorage.getItem('firesafety.lan.token') ?? '';
let lanUser = '';
let lanPassword = '';
let lanProfile: Profile | null = null;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}
function property(value: unknown, name: string): unknown {
  const source = object(value);
  if (!source) return undefined;
  const key = Object.keys(source).find(x => x.toLowerCase() === name.toLowerCase());
  return key ? source[key] : undefined;
}
function text(value: unknown, ...names: string[]): string {
  for (const name of names) {
    const found = property(value, name);
    if (found !== undefined && found !== null && String(found).trim()) return String(found);
  }
  return '';
}
function findText(value: unknown, names: string[]): string {
  const direct = text(value, ...names);
  if (direct) return direct;
  const source = object(value);
  if (!source) return '';
  for (const child of Object.values(source)) {
    const found = findText(child, names);
    if (found) return found;
  }
  return '';
}
function findToken(value: unknown): string {
  return findText(value, ['accessToken', 'access_token', 'token', 'jwt', 'jwtToken']);
}
function rows(value: unknown): JsonObject[] {
  if (property(value, 'success') === false) throw new Error('RSM từ chối database call.');
  if (Array.isArray(value)) return value.filter((x): x is JsonObject => !!object(x));
  for (const name of ['rows', 'result', 'data', 'value']) {
    const child = property(value, name);
    if (Array.isArray(child)) return child.filter((x): x is JsonObject => !!object(x));
    for (const nested of ['rows', 'result', 'data', 'value']) {
      const nestedValue = property(child, nested);
      if (Array.isArray(nestedValue)) return nestedValue.filter((x): x is JsonObject => !!object(x));
    }
  }
  throw new Error('Phản hồi RSM không có danh sách dữ liệu.');
}
function master(value: unknown, functionName: string): MasterDelta<any> {
  let result: unknown = value;
  const directType = property(value, 'type');
  const data = property(value, 'data');
  const nested = object(data) ? property(data, functionName) : undefined;
  if (nested !== undefined) result = nested;
  else if (!directType && (Array.isArray(value) || property(value, 'rows') || data || property(value, 'result'))) {
    const list = rows(value);
    result = list.length === 1 ? list[0] : list;
  }
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { throw new Error('Phản hồi master RSM không phải JSON hợp lệ.'); }
  }
  const resultObject = object(result);
  const nestedResult = property(resultObject, functionName) ?? property(resultObject, 'result') ?? property(resultObject, 'value');
  if (nestedResult !== undefined) result = nestedResult;
  const final = object(result);
  const dataRows = property(final, 'data');
  const type = text(final, 'type');
  const syncAt = text(final, 'syncAt', 'sync_at');
  if (!type || !syncAt || !Array.isArray(dataRows)) throw new Error('Phản hồi master RSM chưa đủ dữ liệu.');
  return {
    type, syncAt, data: dataRows,
    ...(text(final, 'windowFrom', 'window_from') ? { windowFrom: text(final, 'windowFrom', 'window_from') } : {}),
    ...(text(final, 'windowTo', 'window_to') ? { windowTo: text(final, 'windowTo', 'window_to') } : {})
  };
}
function dateKey(value: unknown): string {
  const valueText = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(valueText) ? valueText.slice(0, 10).replace(/-/g, '') : valueText;
}
function mapRepairs(input: JsonObject[]): Repair[] {
  return input.map(row => {
    const plantCd = text(row, 'PLANT_CD');
    const areaLoc = text(row, 'AREA_LOC');
    const wsLoc = text(row, 'WS_LOC');
    const subWsLoc = text(row, 'SUB_WS_LOC');
    const itemGroupCd = text(row, 'ITEM_GROUP_CD');
    const itemCd = text(row, 'ITEM_CD');
    const scheduleDate = dateKey(text(row, 'SCHEDULE_DATE'));
    const checkDate = dateKey(text(row, 'CHECK_DATE'));
    return {
      id: [plantCd, areaLoc, wsLoc, subWsLoc, itemGroupCd, itemCd, scheduleDate, checkDate].join('|'),
      plantCd, areaLoc, wsLoc, subWsLoc, itemGroupCd, itemCd, scheduleDate, checkDate,
      itemName: text(row, 'ITEM_NAME_VN') || itemCd,
      equipmentName: text(row, 'SUB_WS_NAME') || subWsLoc,
      countermeasureName: text(row, 'CHECK_CM_VN', 'CHECK_CM'),
      completeDate: dateKey(text(row, 'COMPLETE_DATE')),
      actionStatus: text(row, 'ACTION_STATUS') || 'OPEN'
    };
  });
}
async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/json', ...init.headers }
  });
  const bodyText = await response.text();
  let body: unknown = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { throw new Error('API trả về JSON không hợp lệ.'); }
  if (!response.ok) throw new Error(`API HTTP ${response.status}: ${text(body, 'message', 'error') || 'yêu cầu thất bại'}`);
  return body;
}
function profileFromLogin(value: unknown, employeeId: string): Profile {
  const source = property(value, 'profile') ?? property(value, 'user') ?? property(value, 'employee') ?? value;
  return {
    employeeId: findText(source, ['employeeId', 'employee_id', 'empId', 'emp_id', 'EMPID']) || employeeId,
    fullName: findText(source, ['fullName', 'full_name', 'name', 'NAME_EN', 'NAME_VI']) || employeeId,
    deptName: findText(source, ['deptName', 'dept_name', 'departmentName', 'DEPT_NM']) || undefined,
    factoryCode: findText(source, ['factoryCode', 'factory_code', 'FACTORY']) || undefined
  };
}
async function loginLan(user: string, password: string): Promise<Profile> {
  const response = await requestJson(`${LAN_API_BASE}/api/Auth/login`, {
    method: 'POST', body: JSON.stringify({ empId: user, password })
  });
  const token = findToken(response);
  if (!token) throw new Error('Đăng nhập RSM không trả về access token.');
  lanToken = token;
  lanUser = user;
  lanPassword = password;
  lanProfile = profileFromLogin(response, user);
  sessionStorage.setItem('firesafety.lan.token', token);
  return lanProfile;
}
async function rsmCall(functionName: string, params: Record<string, unknown>): Promise<unknown> {
  if (!lanToken) {
    if (!lanUser || !lanPassword) throw new Error('Phiên LAN đã hết hạn. Vui lòng đăng nhập lại.');
    await loginLan(lanUser, lanPassword);
  }
  const body = { name: functionName, schema: 'rsm', database: null, kind: 'function', params };
  const response = await fetch(`${LAN_API_BASE}/api/Db/call`, {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lanToken}` },
    body: JSON.stringify(body)
  });
  if (response.status === 401 && lanUser && lanPassword) {
    await loginLan(lanUser, lanPassword);
    return rsmCall(functionName, params);
  }
  const responseText = await response.text();
  let result: unknown = {};
  try { result = responseText ? JSON.parse(responseText) : {}; } catch { throw new Error('RSM trả về JSON không hợp lệ.'); }
  if (!response.ok) throw new Error(`RSM ${functionName} HTTP ${response.status}`);
  return result;
}
export async function signIn(employeeId: string, password: string): Promise<Profile> {
  if (target === 'lan') {
    if (!employeeId.trim() || !password.trim()) throw new Error('LAN yêu cầu user và password.');
    return loginLan(employeeId.trim(), password);
  }
  if (!supabase) throw new Error('Chưa cấu hình Supabase.');
  if (!password) throw new Error('Internet yêu cầu mật khẩu để bảo vệ tài khoản.');
  if (!employeeId.includes('@')) throw new Error('Đăng nhập Internet cần email công ty và mật khẩu.');
  const { error } = await supabase.auth.signInWithPassword({ email: employeeId, password });
  if (error) throw new Error(error.message);
  return cloudRequest<Profile>('me', {});
}
export async function signOut(): Promise<void> {
  if (target === 'lan') {
    lanToken = '';
    lanUser = '';
    lanPassword = '';
    lanProfile = null;
    sessionStorage.removeItem('firesafety.lan.token');
    return;
  }
  if (supabase) await supabase.auth.signOut();
}
export async function loadBootstrap(employeeId: string, cursors?: MasterCursorMap): Promise<BootstrapData> {
  if (target === 'lan') {
    if (lanProfile && lanProfile.employeeId !== employeeId) throw new Error('Sai tài khoản LAN đang hoạt động.');
    const types = ['CHECKLIST_ITEM', 'CODE', 'COUNTERMEASURE_ITEM', 'EQUIPMENT', 'LOCATION', 'SCHEDULE'] as const;
    const masters = await Promise.all(types.map(async type => {
      const key = type.toLowerCase() as keyof MasterCursorMap;
      const result = await rsmCall('dz_web_get_master', {
        p_emp_id: employeeId, p_type: type,
        p_updated_after: type === 'SCHEDULE' ? null : cursors?.[key] || null
      });
      return [key, master(result, 'dz_web_get_master')];
    }));
    const repairs = mapRepairs(rows(await rsmCall('fn_dz_scan_get_open_repairs', { p_emp_id: employeeId })));
    return {
      profile: lanProfile ?? { employeeId, fullName: employeeId },
      masters: Object.fromEntries(masters) as BootstrapData['masters'],
      repairs
    };
  }
  return cloudRequest<BootstrapData>('bootstrap', {});
}
async function cloudRequest<T>(action: string, body: object): Promise<T> {
  if (!supabase) throw new Error('Chưa cấu hình Supabase.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Phiên đăng nhập Internet đã hết hạn.');
  const { data, error } = await supabase.functions.invoke('firesafety', { body: { action, ...body } });
  if (error) throw new Error(error.message);
  return data as T;
}
function functionSucceeded(value: unknown, functionName: string): boolean {
  if (property(value, 'success') === false) return false;
  if (property(value, 'success') !== true) throw new Error(`Phản hồi RSM ${functionName} thiếu success.`);
  const rowCount = property(value, 'rowCount');
  return typeof rowCount === 'number' ? rowCount > 0 : true;
}
export async function uploadEvent(event: OutboxEvent): Promise<void> {
  if (target === 'internet') {
    const result = await cloudRequest<{ success: boolean }>('event', { event });
    if (result.success !== true) throw new Error('Máy chủ chưa xác nhận đã lưu dữ liệu.');
    return;
  }
  if (event.type === 'repair') throw new Error('API LAN chưa có hàm hoàn tất sửa chữa không kèm ảnh.');
  const inspection = event.payload as Inspection;
  const result = await rsmCall('fn_dz_scan_save_inspection', {
    p_payload: {
      plantCd: inspection.plantCd, equipId: inspection.equipId, scheduleDate: inspection.scheduleDate,
      inspectorId: inspection.employeeId,
      items: inspection.items.map(item => ({ itemId: item.itemId, checkResult: item.checkResult, counterId: item.counterId, dueDate: item.dueDate }))
    }
  });
  if (!functionSucceeded(result, 'fn_dz_scan_save_inspection')) throw new Error('RSM chưa xác nhận đã lưu checklist.');
}
async function probe(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return response.status < 500;
  } catch { return false; }
}
export async function detectConnection(): Promise<'lan' | 'internet' | 'offline'> {
  if (target === 'lan') return await probe(LAN_API_BASE) ? 'lan' : 'offline';
  if (supabaseUrl && await probe(`${supabaseUrl}/auth/v1/health`)) return 'internet';
  return 'offline';
}
