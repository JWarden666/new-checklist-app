import { getStore } from '@netlify/blobs';
import type { Config, Context } from '@netlify/functions';

const STORE_NAME = 'checklist-live';

export default async (req: Request, context: Context) => {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  const url = new URL(req.url);
  const dateParam = context.params.date;

  if (req.method === 'GET') {
    if (!dateParam) {
      return Response.json({ error: 'Missing date parameter' }, { status: 400 });
    }

    const record = await store.get(dateParam, { type: 'json' }) as any;

    if (!record) {
      return Response.json({ exists: false, version: 0, tasks: [] });
    }

    return Response.json({
      exists: true,
      version: record.version || 0,
      tasks: record.tasks || [],
      lastUpdated: record.lastUpdated || null,
    });
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const { tasks } = body;
    const date = context.params.date;

    if (!date || !tasks) {
      return Response.json({ error: 'Missing date or tasks' }, { status: 400 });
    }

    // Read current version to increment it
    const existing = await store.get(date, { type: 'json' }) as any;
    const currentVersion = existing?.version || 0;
    const newVersion = currentVersion + 1;

    const record = {
      date,
      tasks,
      version: newVersion,
      lastUpdated: new Date().toISOString(),
    };

    await store.setJSON(date, record);

    return Response.json({
      success: true,
      version: newVersion,
      lastUpdated: record.lastUpdated,
    });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config: Config = {
  path: ['/api/checklist/:date'],
  method: ['GET', 'POST'],
};
