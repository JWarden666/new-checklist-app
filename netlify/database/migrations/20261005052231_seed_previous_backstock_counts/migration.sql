-- Custom SQL migration file, put your code below! --
-- Restore the counts that were scheduled for Sunday, 2026-10-04 (they appeared in that day's
-- "Today's Counts" section) but were saved to a database the live site doesn't use.
INSERT INTO "backstock_counts" ("name", "days", "sort_order")
SELECT v.name, ARRAY[0]::integer[], v.sort_order
FROM (VALUES
	('Produce Bulk', 0),
	('Comm Bakery', 1),
	('Deli', 2),
	('Deli Bulk', 3),
	('Seafood Bulk', 4)
) AS v(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM "backstock_counts" b WHERE b.name = v.name);
