import type { Config } from '@netlify/functions';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { removedSections } from '../../db/schema.js';

/** Sections removed from the checklist. POST removes a section, DELETE brings it back. */
export default async (req: Request) => {
  if (req.method === 'GET') {
    const rows = await db.select().from(removedSections).orderBy(asc(removedSections.name));
    return Response.json(rows.map(r => r.name));
  }

  // Section names can contain "/" (e.g. "Backroom/Daily Counts"), so they are sent in the body
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return Response.json({ error: 'Missing section name' }, { status: 400 });
  }

  if (req.method === 'POST') {
    await db.insert(removedSections).values({ name }).onConflictDoNothing();
    return Response.json({ success: true, name }, { status: 201 });
  }

  if (req.method === 'DELETE') {
    await db.delete(removedSections).where(eq(removedSections.name, name));
    return Response.json({ success: true });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config: Config = {
  path: '/api/sections/removed',
  method: ['GET', 'POST', 'DELETE'],
};
