import type { Config, Context } from '@netlify/functions';
import {
  getCompletions,
  getConfig,
  getLastSync,
  getPacificDateKey,
  isConfigured,
  isMockMode,
  runSync,
  saveConfig,
} from '../lib/gospotcheck.mts';

export default async (req: Request, context: Context) => {
  const action = context.params.action;

  // GET /api/gospotcheck/config — mappings, connection state, and last sync
  if (req.method === 'GET' && action === 'config') {
    const date = getPacificDateKey();
    const [config, lastSync, completions] = await Promise.all([
      getConfig(),
      getLastSync(),
      getCompletions(date),
    ]);
    return Response.json({ configured: isConfigured(), mock: isMockMode(), config, lastSync, completions, date });
  }

  // PUT /api/gospotcheck/config — save mission mappings
  if (req.method === 'PUT' && action === 'config') {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const config = await saveConfig({ placeId: body?.placeId, mappings: body?.mappings || [] });
    return Response.json({ success: true, config });
  }

  // POST /api/gospotcheck/sync — pull completed missions now
  if (req.method === 'POST' && action === 'sync') {
    const result = await runSync();
    return Response.json(result, { status: result.ok ? 200 : 502 });
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
};

export const config: Config = {
  path: '/api/gospotcheck/:action',
  method: ['GET', 'PUT', 'POST'],
};
