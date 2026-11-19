import { authorizeKpi } from './second-brain-access.mjs';

/** Machine-only Cult graph. Uses the same financial-reader scope as KPI.
 * @param {Request} request
 * @param {string | undefined} configuration
 * @param {(url: URL) => Promise<Response>} load
 */
export async function cashflowRead(request, configuration, load) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const access = authorizeKpi(request.headers.get('authorization'), configuration);
  if (!access.ok) return Response.json({ error: access.status === 503 ? 'API not configured' : 'Access denied' }, { status: access.status, headers });
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  if ([...new URL(request.url).searchParams.keys()].length) return Response.json({ error: 'No parameters accepted' }, { status: 400, headers });
  try {
    const url = new URL('/api/cashflow', request.url);
    url.searchParams.set('entity', 'cult');
    const response = await load(url);
    if (!response.ok) throw new Error();
    return Response.json({ entity: 'cult', report: 'cashflow', source: 'finance-dashboard',
      fetchedAt: new Date().toISOString(), data: await response.json() }, { headers });
  } catch {
    return Response.json({ error: 'Dashboard data unavailable' }, { status: 502, headers });
  }
}
