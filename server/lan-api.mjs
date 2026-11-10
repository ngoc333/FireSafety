// Minimal LAN-only API using the existing Oracle and RSM gateways.
// No browser credentials. Writes fail closed until atomic DB idempotency is confirmed.
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { rsmRows, rsmJson, mapRepairs } from './rsm-mapping.mjs';

const root = '/api/fire-safety';
const port = Number(process.env.FS_LAN_PORT || 5088);
const host = process.env.FS_LAN_HOST || '127.0.0.1';
const oracleBase = (process.env.FS_ORACLE_GATEWAY_URL || '').replace(/\/$/, '');
const rsmBase = (process.env.FS_RSM_URL || '').replace(/\/$/, '');
const serviceId = process.env.FS_RSM_SERVICE_ID || '';
const servicePassword = process.env.FS_RSM_SERVICE_PASSWORD || '';
const sessionKey = process.env.FS_SESSION_SECRET || '';
const allowedOrigins = (process.env.FS_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
const secureCookie = process.env.FS_COOKIE_SECURE !== 'false';
const ready = !!(oracleBase && rsmBase && serviceId && servicePassword && sessionKey.length >= 32);

function respond(res, status, value, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(JSON.stringify(value));
}
function sign(payload) {
  return createHmac('sha256', sessionKey).update(payload).digest('base64url');
}
function issueSession(profile) {
  const payload = Buffer.from(JSON.stringify({
    employeeId: profile.employeeId, fullName: profile.fullName,
    deptName: profile.deptName, factoryCode: profile.factoryCode,
    expires: Date.now() + 8 * 60 * 60 * 1000
  })).toString('base64url');
  return payload + '.' + sign(payload);
}
function readSession(req) {
  const cookies = (req.headers.cookie || '').split(';').map(x => x.trim());
  const token = cookies.find(x => x.startsWith('fs_session='))?.slice('fs_session='.length);
  if (!token || token.length > 2000 || !token.includes('.')) return null;
  const [payload, supplied] = token.split('.');
  const expected = sign(payload);
  if (!supplied || supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.employeeId === 'string' && data.expires > Date.now() ? data : null;
  } catch { return null; }
}
function cookie(token) {
  return 'fs_session=' + token + '; HttpOnly; SameSite=Strict; Path=' + root
    + (secureCookie ? '; Secure' : '') + '; Max-Age=' + (token ? 8 * 60 * 60 : 0);
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8192) throw Error('Body too large');
  }
  return JSON.parse(body);
}
async function jsonPost(url, body, token = '') {
  const res = await fetch(url, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {})
  }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw Error('Gateway returned invalid JSON'); }
  return { status: res.status, ok: res.ok, payload };
}
function field(row, name) {
  const hit = row && typeof row === 'object'
    ? Object.entries(row).find(([key]) => key.toLowerCase() === name.toLowerCase())
    : undefined;
  return hit?.[1] == null ? '' : String(hit[1]);
}
function oracleRows(body) {
  if (body?.success !== true) throw Error('Oracle gateway rejected login');
  if (Array.isArray(body.data)) return body.data;
  if (body.data && typeof body.data === 'object') {
    const rows = Object.values(body.data).find(Array.isArray);
    if (rows) return rows;
  }
  return [];
}
async function readEmployee(employeeId) {
  const request = {
    dbName: 'LMES', packageName: 'PKG_FIRE_SAFETY_PDA',
    procedureName: 'SMT_DOWNLOAD',
    params: {
      ARG_TYPE: { type: 'IN', value: 'EMPLOYEE' },
      ARG_PLANT: { type: 'IN', value: employeeId },
      OUT_CURSOR: { type: 'OUT', dataType: 'CURSOR' }
    }
  };
  const result = await jsonPost(oracleBase + '/api/call-procedure', request);
  if (!result.ok) throw Error('Oracle gateway HTTP ' + result.status);
  const row = oracleRows(result.payload)[0];
  if (!row || field(row, 'EMPID') !== employeeId) return null;
  return {
    employeeId, fullName: field(row, 'NAME_EN') || field(row, 'NAME_VI') || employeeId,
    deptName: field(row, 'DEPT_NM'), factoryCode: field(row, 'FACTORY')
  };
}

let accessToken = '';
let tokenPromise = null;
async function getToken() {
  if (accessToken) return accessToken;
  if (!tokenPromise) tokenPromise = (async () => {
    const result = await jsonPost(rsmBase + '/api/Auth/login',
      { empId: serviceId, password: servicePassword });
    if (!result.ok) throw Error('RSM login HTTP ' + result.status);
    const data = result.payload?.data && typeof result.payload.data === 'object'
      ? result.payload.data : result.payload;
    const token = data?.accessToken || data?.access_token || data?.token ||
      data?.jwt || data?.jwtToken;
    if (!token || typeof token !== 'string') throw Error('RSM login missing access token');
    accessToken = token;
    return token;
  })().finally(() => { tokenPromise = null; });
  return tokenPromise;
}
async function rsmCall(name, params) {
  const payload = { name, schema: 'rsm', database: null, kind: 'function', params };
  let result = await jsonPost(rsmBase + '/api/Db/call', payload, await getToken());
  if (result.status === 401) {
    accessToken = '';
    result = await jsonPost(rsmBase + '/api/Db/call', payload, await getToken());
  }
  if (!result.ok) throw Error('RSM ' + name + ' HTTP ' + result.status);
  return rsmRows(result.payload);
}
async function rsmJsonCall(name, params) {
  const payload = { name, schema: 'rsm', database: null, kind: 'function', params };
  let result = await jsonPost(rsmBase + '/api/Db/call', payload, await getToken());
  if (result.status === 401) {
    accessToken = '';
    result = await jsonPost(rsmBase + '/api/Db/call', payload, await getToken());
  }
  if (!result.ok) throw Error('RSM ' + name + ' HTTP ' + result.status);
  return rsmJson(result.payload, name);
}
const masterTypes = ['CHECKLIST_ITEM', 'CODE', 'COUNTERMEASURE_ITEM', 'EQUIPMENT', 'LOCATION', 'SCHEDULE'];
async function bootstrap(profile, cursors = {}) {
  const employee = { p_emp_id: profile.employeeId };
  const masters = await Promise.all(masterTypes.map(async type => {
    const key = type.toLowerCase();
    const params = { ...employee, p_type: type };
    if (type !== 'SCHEDULE') params.p_updated_after = cursors[key] || null;
    else params.p_updated_after = null;
    return [key, await rsmJsonCall('dz_web_get_master', params)];
  }));
  const repairs = mapRepairs(await rsmCall('fn_dz_scan_get_open_repairs', employee));
  return { profile, masters: Object.fromEntries(masters), repairs };
}

if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid FS_LAN_PORT');
if (!ready) {
  console.error('LAN API missing gateway URLs, RSM account or 32+ character session secret.');
  process.exitCode = 1;
} else {
  createServer(async (req, res) => {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (!path.startsWith(root + '/')) { respond(res, 404, { error: 'Not found' }); return; }
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      const sameOrigin = origin === 'http://' + req.headers.host ||
        origin === 'https://' + req.headers.host;
      if (origin && !sameOrigin && !allowedOrigins.includes(origin)) {
        respond(res, 403, { error: 'Origin not allowed' }); return;
      }
    }
    try {
      if (req.method === 'GET' && path === root + '/health') {
        respond(res, 200, { success: true }); return;
      }
      if (req.method === 'POST' && path === root + '/login') {
        const body = await readBody(req);
        const employeeId = String(body.employeeId ?? '').trim();
        if (!/^[A-Za-z0-9]{2,32}$/.test(employeeId)) {
          respond(res, 400, { error: 'Invalid employee ID' }); return;
        }
        const profile = await readEmployee(employeeId);
        if (!profile) { respond(res, 401, { error: 'Employee not found' }); return; }
        respond(res, 200, { profile }, { 'Set-Cookie': cookie(issueSession(profile)) });
        return;
      }
      if (req.method === 'POST' && path === root + '/logout') {
        respond(res, 200, { success: true }, { 'Set-Cookie': cookie('') }); return;
      }
      const identity = readSession(req);
      if (!identity) { respond(res, 401, { error: 'Session expired' }); return; }
      if (req.method === 'GET' && path === root + '/bootstrap') {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const requested = query.get('employeeId');
        if (requested && requested !== identity.employeeId) {
          respond(res, 403, { error: 'Employee mismatch' }); return;
        }
        const cursors = Object.fromEntries(['checklist_item','code','countermeasure_item','equipment','location']
          .map(type => [type, query.get(type) || '']));
        respond(res, 200, await bootstrap(identity, cursors)); return;
      }
      if (req.method === 'POST' && path === root + '/events') {
        // Never acknowledge without an atomic event ID contract in PostgreSQL.
        respond(res, 501, { success: false, error:
          'Event write requires confirmed PostgreSQL idempotency contract' });
        return;
      }
      respond(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error('LAN gateway error:', error instanceof Error ? error.message : 'unknown');
      respond(res, 502, { error: 'Internal gateway unavailable or returned invalid response' });
    }
  }).listen(port, host, () => {
    console.log('FireSafety LAN API: http://' + host + ':' + port + root);
  });
}
