// Choose the backend once from the site hostname. Never use network availability for routing.
export type ApiTarget = 'lan' | 'internet';

function privateIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p))) return false;
  const [a, b, c, d] = parts.map(Number);
  if ([a, b, c, d].some(n => n > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function resolveApiTarget(hostname: string): ApiTarget {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return 'lan';
  }
  if (host === 'dskorea.com' || host.endsWith('.dskorea.com') || privateIPv4(host)) {
    return 'lan';
  }
  return 'internet';
}

// IndexedDB is separated by both backend AND employee. No cross-account outbox uploads.
export function employeeDbName(target: ApiTarget, employeeId: string): string {
  const id = employeeId.trim().toLowerCase();
  if (!id) throw new Error('Employee ID is required');
  return 'FireSafety_' + target + '_' + encodeURIComponent(id);
}
