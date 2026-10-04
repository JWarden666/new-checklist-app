import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';

const STORE_NAME = 'checklist-template';
const TEMPLATE_KEY = 'current';

// The template is the section/item layout every new day starts from.
// It is updated whenever sections or items are added, renamed, or deleted.
export default async (req: Request) => {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  if (req.method === 'GET') {
    const record = await store.get(TEMPLATE_KEY, { type: 'json' }) as any;
    if (!record) {
      return Response.json({ exists: false, tasks: [] });
    }
    return Response.json({ exists: true, tasks: record.tasks || [], lastUpdated: record.lastUpdated || null });
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const { tasks } = body;

    if (!Array.isArray(tasks)) {
      return Response.json({ error: 'Missing tasks' }, { status: 400 });
    }

    const record = {
      tasks,
      lastUpdated: new Date().toISOString(),
    };
    await store.setJSON(TEMPLATE_KEY, record);

    return Response.json({ success: true, lastUpdated: record.lastUpdated });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config: Config = {
  path: ['/api/template'],
  method: ['GET', 'POST'],
};
