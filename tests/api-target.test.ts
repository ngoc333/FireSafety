import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiTarget, employeeDbName } from '../src/api-target.ts';

test('localhost override selects either backend', () => {
  assert.equal(resolveApiTarget('localhost', 'lan'), 'lan');
  assert.equal(resolveApiTarget('localhost', 'internet'), 'internet');
  assert.equal(resolveApiTarget('127.0.0.1', 'internet'), 'internet');
  assert.equal(resolveApiTarget('[::1]', 'internet'), 'internet');
  assert.equal(resolveApiTarget('localhost'), 'lan');
});

test('internal addresses always use LAN even if env requests internet', () => {
  for (const host of ['firesafety.dskorea.com', 'FIRESAFETY.DSKOREA.COM', 'dskorea.com',
    '10.10.1.50', '192.168.1.100', '172.16.0.1', '172.31.255.254']) {
    assert.equal(resolveApiTarget(host, 'internet'), 'lan', host);
  }
});

test('public hosts and domain lookalikes use Supabase', () => {
  for (const host of ['firesafety.vercel.app', 'example.com', 'dskorea.com.evil.test',
    'mydskorea.com', '172.32.0.1', '172.15.0.1', '8.8.8.8',
    '192.168.1.500', '10.0.0.1.evil.test']) {
    assert.equal(resolveApiTarget(host, 'lan'), 'internet', host);
  }
});

test('IndexedDB scopes are unique by backend and employee', () => {
  assert.notEqual(employeeDbName('lan', '123'), employeeDbName('internet', '123'));
  assert.notEqual(employeeDbName('lan', '123'), employeeDbName('lan', '456'));
  assert.equal(employeeDbName('lan', 'ABC'), employeeDbName('lan', 'abc'));
});
