import type { Config, Context } from '@netlify/functions';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { backstockCounts } from '../../db/schema.js';

/** Keep only valid, unique weekday numbers (0 = Sunday ... 6 = Saturday) */
function cleanDays(days: unknown): number[] {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
}

export default async (req: Request, context: Context) => {
  const id = context.params.id ? Number(context.params.id) : null;

  if (req.method === 'GET') {
    const rows = await db
      .select()
      .from(backstockCounts)
      .orderBy(asc(backstockCounts.sortOrder), asc(backstockCounts.id));
    return Response.json(rows);
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return Response.json({ error: 'Missing count name' }, { status: 400 });
    }
    const existing = await db.select({ id: backstockCounts.id }).from(backstockCounts);
    const [row] = await db
      .insert(backstockCounts)
      .values({ name, days: cleanDays(body.days), sortOrder: existing.length })
      .returning();
    return Response.json(row, { status: 201 });
  }

  if (!id || !Number.isInteger(id)) {
    return Response.json({ error: 'Missing count id' }, { status: 400 });
  }

  if (req.method === 'PUT') {
    const body = await req.json();
    const updates: { name?: string; days?: number[] } = {};
    if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
    if (body.days !== undefined) updates.days = cleanDays(body.days);
    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'Nothing to update' }, { status: 400 });
    }
    const [row] = await db
      .update(backstockCounts)
      .set(updates)
      .where(eq(backstockCounts.id, id))
      .returning();
    if (!row) return Response.json({ error: 'Count not found' }, { status: 404 });
    return Response.json(row);
  }

  if (req.method === 'DELETE') {
    await db.delete(backstockCounts).where(eq(backstockCounts.id, id));
    return Response.json({ success: true });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config: Config = {
  path: ['/api/counts', '/api/counts/:id'],
  method: ['GET', 'POST', 'PUT', 'DELETE'],
};
