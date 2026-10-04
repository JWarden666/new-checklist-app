import { getStore } from '@netlify/blobs';
import type { Config, Context } from '@netlify/functions';

const STORE_NAME = 'checklist-history';

// Items with multiple checkboxes (e.g. Backroom / Daily Counts) count each checkbox separately
function countUnits(tasks: any[] | undefined): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const t of tasks || []) {
    if (Array.isArray(t.checks) && t.checks.length > 0) {
      total += t.checks.length;
      done += t.checks.filter((c: any) => c.completed).length;
    } else {
      total += 1;
      if (t.completed) done += 1;
    }
  }
  return { done, total };
}

export default async (req: Request, context: Context) => {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  const url = new URL(req.url);

  if (req.method === 'POST') {
    const body = await req.json();
    const { date, tasks, completionPercentage } = body;

    if (!date) {
      return Response.json({ error: 'Missing date field' }, { status: 400 });
    }

    const record = {
      date,
      tasks,
      completionPercentage,
    };

    await store.setJSON(date, record);
    return Response.json({ success: true, date, completionPercentage });
  }

  if (req.method === 'GET') {
    const date = context.params.date;

    // If no date param, list all history entries
    if (!date) {
      const { blobs } = await store.list();
      const entries = [];
      for (const blob of blobs) {
        const record = await store.get(blob.key, { type: 'json' }) as any;
        if (record) {
          entries.push({
            date: record.date,
            completionPercentage: record.completionPercentage,
            taskCount: countUnits(record.tasks).total,
            completedCount: countUnits(record.tasks).done,
          });
        }
      }
      // Sort by date descending (most recent first)
      entries.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return Response.json(entries);
    }

    const record = await store.get(date, { type: 'json' });

    if (!record) {
      return Response.json({ error: 'No history found for this date' }, { status: 404 });
    }

    return Response.json(record);
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config: Config = {
  path: ['/api/history', '/api/history/:date'],
  method: ['GET', 'POST'],
};
