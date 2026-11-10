import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';

async function openServer(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
async function freePort() {
  const server = createServer();
  const port = await openServer(server);
  await new Promise(resolve => server.close(resolve));
  return port;
}
test('LAN adapter authenticates, scopes bootstrap and never acknowledges writes', async () => {
  const functionNames = [];
  const gateway = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = body ? JSON.parse(body) : {};
    let reply = {};
    if (req.url === '/api/call-procedure') {
      assert.equal(input.procedureName, 'SMT_DOWNLOAD');
      assert.equal(input.params.ARG_PLANT.value, '12345678');
      reply = { success: true, data: [{ EMPID: '12345678', NAME_EN: 'Worker',
        DEPT_NM: 'IT', FACTORY: '2210' }] };
    } else if (req.url === '/api/Auth/login') {
      assert.equal(input.empId, 'service');
      reply = { accessToken: 'mock-jwt-token' };
    } else if (req.url === '/api/Db/call') {
      assert.equal(req.headers.authorization, 'Bearer mock-jwt-token');
      assert.equal(input.schema, 'rsm');
      assert.equal(input.params.p_emp_id, '12345678');
      functionNames.push(input.name);
      const rows = input.name === 'fn_dz_scan_get_locations'
        ? [{ PLANT_CD: '2210', AREA_LOC: 'A', WS_LOC: 'W', SUB_WS_LOC: 'E',
          SUB_WS_ID: 'QR1', SUB_WS_NAME: 'Machine', ITEM_GROUP_CD: 'G' }]
        : [];
      reply = { success: true, rowCount: rows.length, data: rows };
    } else {
      res.writeHead(404); res.end(); return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(reply));
  });
  const gatewayPort = await openServer(gateway);
  const port = await freePort();
  const env = {
    ...process.env,
    FS_LAN_HOST: '127.0.0.1', FS_LAN_PORT: String(port),
    FS_ORACLE_GATEWAY_URL: 'http://127.0.0.1:' + gatewayPort,
    FS_RSM_URL: 'http://127.0.0.1:' + gatewayPort,
    FS_RSM_SERVICE_ID: 'service', FS_RSM_SERVICE_PASSWORD: 'test-password',
    FS_SESSION_SECRET: 'test-only-session-secret-32-chars-long',
    FS_COOKIE_SECURE: 'false'
  };
  const child = spawn(process.execPath, ['server/lan-api.mjs'], { env, stdio: 'ignore' });
  const base = 'http://127.0.0.1:' + port + '/api/fire-safety';
  try {
    let healthy = false;
    for (let n=0; n<40; n++) {
      try {
        healthy = (await fetch(base + '/health')).ok;
        if (healthy) break;
      } catch { /* booting */ }
      await pause(100);
    }
    assert.equal(healthy, true, 'API started');
    const denied = await fetch(base + '/bootstrap');
    assert.equal(denied.status, 401);
    const logged = await fetch(base + '/login', { method: 'POST', headers: {
      'Content-Type': 'application/json'
    }, body: JSON.stringify({ employeeId: '12345678' }) });
    assert.equal(logged.status, 200);
    assert.equal((await logged.json()).profile.employeeId, '12345678');
    const cookie = logged.headers.get('set-cookie').split(';')[0];
    assert.match(cookie, /^fs_session=/);
    const mismatch = await fetch(base + '/bootstrap?employeeId=99999999', { headers: { Cookie: cookie } });
    assert.equal(mismatch.status, 403);
    const result = await fetch(base + '/bootstrap?employeeId=12345678', { headers: { Cookie: cookie } });
    assert.equal(result.status, 200);
    const bootstrap = await result.json();
    assert.equal(bootstrap.profile.employeeId, '12345678');
    assert.equal(bootstrap.locations[0].subWsId, 'QR1');
    assert.equal(functionNames.length, 5);
    const write = await fetch(base + '/events', { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(write.status, 501);
    assert.equal((await write.json()).success, false);
  } finally {
    child.kill();
    gateway.closeAllConnections();
    await new Promise(resolve => gateway.close(resolve));
  }
});
