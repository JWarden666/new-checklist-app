import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

/** Backstock counts and the weekdays (0 = Sunday ... 6 = Saturday) they are due */
export const backstockCounts = pgTable('backstock_counts', {
  id: serial().primaryKey(),
  name: text().notNull(),
  days: integer().array().notNull().default([]),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

/** Checklist sections removed from the list; they are left out of every day's checklist */
export const removedSections = pgTable('removed_sections', {
  name: text().primaryKey(),
  removedAt: timestamp('removed_at').defaultNow(),
});
