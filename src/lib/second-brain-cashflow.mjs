import { authorizeKpi } from './second-brain-access.mjs';

export const CASHFLOW_ALLOW = 'GET, OPTIONS';

/** Machine-only Cult graph. Uses the same financial-reader scope as KPI.
 * @param {Request} request
 * @param {string | undefined} configuration
 * @param {(entity: 'cult') => Promise<Response>} load
 */
export async function cashflowRead(request, configuration, load) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const access = authorizeKpi(request.headers.get('authorization'), configuration);
  if (!access.ok) return Response.json({ error: access.status === 503 ? 'API not configured' : 'Access denied' }, { status: access.status, headers });
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { ...headers, Allow: CASHFLOW_ALLOW } });
  }
  if ([...new URL(request.url).searchParams.keys()].length) return Response.json({ error: 'No parameters accepted' }, { status: 400, headers });
  try {
    const response = await load('cult');
    if (!response.ok) throw new Error();
    return Response.json({ entity: 'cult', report: 'cashflow', source: 'finance-dashboard',
      fetchedAt: new Date().toISOString(), data: await response.json() }, { headers });
  } catch {
    return Response.json({ error: 'Dashboard data unavailable' }, { status: 502, headers });
  }
}
